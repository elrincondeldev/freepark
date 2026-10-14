"""Recognising which stored viewpoint a frame shows (design D5).

Frames and exemplars are compared with ORB features + RANSAC homography on a
CLAHE-normalised, banner-masked, ×2 upscaled grayscale image. Homographies are
expressed in normalised [0, 1] image coordinates so zone geometry can be mapped
straight from a view's reference image into the current frame.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field

import cv2
import numpy as np

from app.quality import Mask, banner_mask

UPSCALE = 2.0


@dataclass
class Features:
    keypoints: np.ndarray  # (N, 2) in normalised coordinates
    descriptors: np.ndarray | None
    width: int
    height: int


@dataclass(frozen=True)
class PairMatch:
    inliers: int
    good: int
    homography: np.ndarray  # normalised exemplar coords -> normalised frame coords

    @property
    def inlier_ratio(self) -> float:
        return self.inliers / self.good if self.good else 0.0


@dataclass(frozen=True)
class ViewMatch:
    view_id: int
    exemplar_id: int
    confidence: float
    inliers: int
    homography: np.ndarray  # normalised *reference* coords -> normalised frame coords


@dataclass
class MatcherConfig:
    mask: Mask = (0.0, 0.0, 1.0, 0.09)
    min_inliers: int = 25
    min_inlier_ratio: float = 0.25
    n_features: int = 1500
    ratio_test: float = 0.8
    ransac_px: float = 4.0
    max_scale_change: float = 1.25
    max_translation: float = 0.25  # fraction of the image


class ViewMatcher:
    def __init__(self, config: MatcherConfig | None = None) -> None:
        self.config = config or MatcherConfig()
        self._orb = cv2.ORB_create(nfeatures=self.config.n_features, fastThreshold=10)
        self._bf = cv2.BFMatcher(cv2.NORM_HAMMING)
        self._clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        self._lock = threading.Lock()  # OpenCV objects are not thread-safe

    def features(self, gray: np.ndarray) -> Features:
        h, w = gray.shape
        big = cv2.resize(gray, None, fx=UPSCALE, fy=UPSCALE, interpolation=cv2.INTER_CUBIC)
        big = self._clahe.apply(big)
        mask = banner_mask(big.shape, self.config.mask)
        with self._lock:
            kps, des = self._orb.detectAndCompute(big, mask)
        pts = np.array([k.pt for k in kps], np.float32).reshape(-1, 2)
        pts /= np.array([w * UPSCALE, h * UPSCALE], np.float32)
        return Features(pts, des, w, h)

    def match_pair(self, exemplar: Features, frame: Features) -> PairMatch | None:
        if exemplar.descriptors is None or frame.descriptors is None:
            return None
        if len(exemplar.descriptors) < 2 or len(frame.descriptors) < 2:
            return None
        with self._lock:
            pairs = self._bf.knnMatch(exemplar.descriptors, frame.descriptors, k=2)
        good = [
            m
            for m, *rest in pairs
            if rest and m.distance < self.config.ratio_test * rest[0].distance
        ]
        if len(good) < max(self.config.min_inliers, 4):
            return None
        scale = np.array([frame.width, frame.height], np.float32)
        src = exemplar.keypoints[[m.queryIdx for m in good]] * scale
        dst = frame.keypoints[[m.trainIdx for m in good]] * scale
        H_px, inlier_mask = cv2.findHomography(src, dst, cv2.RANSAC, self.config.ransac_px)
        if H_px is None:
            return None
        if not self._plausible(H_px, frame.width, frame.height):
            return None
        S = np.diag([frame.width, frame.height, 1.0])
        H = np.linalg.inv(S) @ H_px @ S
        return PairMatch(int(inlier_mask.sum()), len(good), H / H[2, 2])

    def _plausible(self, H: np.ndarray, w: int, h: int) -> bool:
        """Reject homographies that are not a small pan/tilt/zoom (near-rigid)."""
        H = H / H[2, 2]
        A = H[:2, :2]
        det = np.linalg.det(A)
        if det <= 0:
            return False
        scale = np.sqrt(det)
        limit = self.config.max_scale_change
        if not (1 / limit <= scale <= limit):
            return False
        sv = np.linalg.svd(A, compute_uv=False)
        if sv[0] / sv[1] > 1.3:  # shear / anisotropic stretch
            return False
        if abs(H[2, 0]) * w > 0.3 or abs(H[2, 1]) * h > 0.3:  # strong perspective change
            return False
        tx, ty = H[0, 2] / w, H[1, 2] / h
        return abs(tx) <= self.config.max_translation and abs(ty) <= self.config.max_translation

    def confidence(self, match: PairMatch) -> float:
        strength = min(1.0, match.inliers / (3 * self.config.min_inliers))
        return round(float(strength * min(1.0, 2 * match.inlier_ratio)), 3)

    def accepts(self, match: PairMatch | None) -> bool:
        return (
            match is not None
            and match.inliers >= self.config.min_inliers
            and match.inlier_ratio >= self.config.min_inlier_ratio
        )


@dataclass
class CachedExemplar:
    view_id: int
    exemplar_id: int
    is_reference: bool
    brightness: float
    ref_homography: np.ndarray  # reference -> exemplar
    features: Features


@dataclass
class CameraViews:
    exemplars: list[CachedExemplar] = field(default_factory=list)


def to_matrix(value: list[list[float]] | None) -> np.ndarray:
    return np.eye(3) if value is None else np.array(value, dtype=np.float64)


def best_view(
    matcher: ViewMatcher, frame: Features, exemplars: list[CachedExemplar]
) -> ViewMatch | None:
    best: tuple[float, int, CachedExemplar, PairMatch] | None = None
    for ex in exemplars:
        m = matcher.match_pair(ex.features, frame)
        if not matcher.accepts(m):
            continue
        assert m is not None
        score = matcher.confidence(m)
        if best is None or (score, m.inliers) > (best[0], best[1]):
            best = (score, m.inliers, ex, m)
    if best is None:
        return None
    score, inliers, ex, m = best
    H = m.homography @ ex.ref_homography  # reference -> exemplar -> frame
    return ViewMatch(ex.view_id, ex.exemplar_id, score, inliers, H / H[2, 2])


def apply_homography(H: np.ndarray, points: np.ndarray) -> np.ndarray:
    pts = np.asarray(points, np.float64).reshape(-1, 1, 2)
    return cv2.perspectiveTransform(pts, H).reshape(-1, 2)
