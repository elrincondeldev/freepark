"""Stored camera views, their exemplar images and cached matching features."""

from __future__ import annotations

import threading

import cv2
import numpy as np

from app.db import Repository, View
from app.frames import FrameStore
from app.quality import Mask, brightness
from app.views import (
    CachedExemplar,
    Features,
    ViewMatch,
    ViewMatcher,
    apply_homography,
    best_view,
    to_matrix,
)

AUTO_EXEMPLAR_MIN_CONFIDENCE = 0.6
AUTO_EXEMPLAR_BRIGHTNESS_GAP = 25.0


def decode_gray(jpeg: bytes) -> np.ndarray:
    img = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError("not a decodable image")
    return img


class ViewRegistry:
    def __init__(
        self,
        repo: Repository,
        store: FrameStore,
        matcher: ViewMatcher,
        mask: Mask,
        max_exemplars: int = 5,
    ) -> None:
        self._repo = repo
        self._store = store
        self._matcher = matcher
        self._mask = mask
        self._max_exemplars = max_exemplars
        self._cache: dict[str, list[CachedExemplar]] = {}
        self._lock = threading.RLock()

    # --- cache ------------------------------------------------------------

    def invalidate(self, camera_id: str) -> None:
        with self._lock:
            self._cache.pop(camera_id, None)

    def exemplars(self, camera_id: str) -> list[CachedExemplar]:
        with self._lock:
            if camera_id not in self._cache:
                self._cache[camera_id] = self._load(camera_id)
            return list(self._cache[camera_id])

    def _load(self, camera_id: str) -> list[CachedExemplar]:
        out: list[CachedExemplar] = []
        for view in self._repo.list_views(camera_id):
            for ex in self._repo.list_exemplars(view.id):
                path = self._store.exemplar_path(ex.frame_path)
                if not path.is_file():
                    continue
                gray = decode_gray(path.read_bytes())
                out.append(
                    CachedExemplar(
                        view_id=view.id,
                        exemplar_id=ex.id,
                        is_reference=ex.is_reference,
                        brightness=ex.brightness,
                        ref_homography=to_matrix(ex.ref_homography),
                        features=self._matcher.features(gray),
                    )
                )
        return out

    # --- matching ---------------------------------------------------------

    def match(self, camera_id: str, gray: np.ndarray) -> tuple[ViewMatch | None, Features]:
        features = self._matcher.features(gray)
        return best_view(self._matcher, features, self.exemplars(camera_id)), features

    def maybe_learn_exemplar(
        self, camera_id: str, match: ViewMatch, jpeg: bytes, gray: np.ndarray
    ) -> bool:
        """Keep confidently matched frames with new lighting as extra exemplars."""
        if match.confidence < AUTO_EXEMPLAR_MIN_CONFIDENCE:
            return False
        light = brightness(gray, self._mask)
        with self._lock:
            same_view = [e for e in self.exemplars(camera_id) if e.view_id == match.view_id]
            if len(same_view) >= self._max_exemplars:
                return False
            if any(abs(e.brightness - light) < AUTO_EXEMPLAR_BRIGHTNESS_GAP for e in same_view):
                return False
            rel = self._store.save_exemplar(match.view_id, jpeg)
            self._repo.add_exemplar(
                match.view_id, rel, light, ref_homography=match.homography.tolist()
            )
            self.invalidate(camera_id)
        return True

    # --- view lifecycle -----------------------------------------------------

    def create_view(self, camera_id: str, name: str, jpeg: bytes) -> View:
        gray = decode_gray(jpeg)
        view = self._repo.create_view(camera_id, name)
        rel = self._store.save_exemplar(view.id, jpeg)
        self._repo.add_exemplar(view.id, rel, brightness(gray, self._mask), is_reference=True)
        self.invalidate(camera_id)
        return view

    def reference_path(self, view_id: int):
        for ex in self._repo.list_exemplars(view_id):
            if ex.is_reference:
                return self._store.exemplar_path(ex.frame_path)
        return None

    def recapture_reference(self, view: View, jpeg: bytes) -> bool:
        """Replace a view's reference image, carrying its zones over when possible.

        Returns True when the zones could be re-aligned to the new reference.
        """
        gray = decode_gray(jpeg)
        old_ref = self.reference_path(view.id)
        realigned = False
        if old_ref is not None and old_ref.is_file():
            old_feat = self._matcher.features(decode_gray(old_ref.read_bytes()))
            m = self._matcher.match_pair(old_feat, self._matcher.features(gray))
            if self._matcher.accepts(m):
                assert m is not None
                for zone in self._repo.list_zones(view.id):
                    pts = apply_homography(m.homography, np.array(zone.points))
                    pts = np.clip(pts, 0.0, 1.0)
                    self._repo.update_zone(zone.id, points=[tuple(map(float, p)) for p in pts])
                realigned = True
        # auto exemplars were relative to the old reference: drop them, they are re-learned
        for ex in self._repo.list_exemplars(view.id):
            self._repo.delete_exemplar(ex.id)
            self._store.exemplar_path(ex.frame_path).unlink(missing_ok=True)
        rel = self._store.save_exemplar(view.id, jpeg)
        self._repo.add_exemplar(view.id, rel, brightness(gray, self._mask), is_reference=True)
        self.invalidate(view.camera_id)
        return realigned

    def delete_view(self, view: View) -> None:
        self._repo.delete_view(view.id)  # cascades to exemplars and zones
        self._store.delete_exemplar_files(view.id)
        self.invalidate(view.camera_id)
