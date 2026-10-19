"""On-disk storage of camera frames and view exemplar images."""

from __future__ import annotations

import hashlib
import re
import uuid
from pathlib import Path

FRAME_ID_RE = re.compile(r"^\d+-[0-9a-f]{8}$")


def make_frame_id(captured_epoch: int, data: bytes) -> str:
    return f"{captured_epoch}-{hashlib.sha256(data).hexdigest()[:8]}"


class FrameStore:
    """Frames live at `<root>/frames/<camera>/<frameId>.jpg`; exemplars at `<root>/exemplars/`."""

    def __init__(
        self, data_dir: Path, retention: int, frames_dir: Path | None = None
    ) -> None:
        self.data_dir = data_dir
        self.frames_dir = frames_dir or data_dir / "frames"
        self.exemplars_dir = data_dir / "exemplars"
        self.retention = retention

    def _camera_dir(self, camera_id: str) -> Path:
        return self.frames_dir / camera_id

    def path(self, camera_id: str, frame_id: str) -> Path | None:
        if not FRAME_ID_RE.match(frame_id):
            return None
        p = self._camera_dir(camera_id) / f"{frame_id}.jpg"
        return p if p.is_file() else None

    def save(
        self, camera_id: str, frame_id: str, data: bytes, protected: set[str] | None = None
    ) -> Path:
        directory = self._camera_dir(camera_id)
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / f"{frame_id}.jpg"
        tmp = target.with_name(f"{frame_id}.{uuid.uuid4().hex}.tmp")
        tmp.write_bytes(data)
        tmp.replace(target)
        self.prune(camera_id, protected)
        return target

    def list_frames(self, camera_id: str) -> list[str]:
        directory = self._camera_dir(camera_id)
        if not directory.is_dir():
            return []
        ids = [p.stem for p in directory.glob("*.jpg") if FRAME_ID_RE.match(p.stem)]
        return sorted(ids, key=lambda f: (int(f.split("-")[0]), f))

    def prune(self, camera_id: str, protected: set[str] | None = None) -> None:
        protected = protected or set()
        frames = self.list_frames(camera_id)
        excess = len(frames) - self.retention
        for frame_id in frames:
            if excess <= 0:
                break
            if frame_id in protected:
                continue
            (self._camera_dir(camera_id) / f"{frame_id}.jpg").unlink(missing_ok=True)
            excess -= 1

    def save_exemplar(self, view_id: int, data: bytes) -> str:
        """Copy an image into the exemplar area; returns a path relative to data_dir."""
        directory = self.exemplars_dir / str(view_id)
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / f"{uuid.uuid4().hex}.jpg"
        target.write_bytes(data)
        return str(target.relative_to(self.data_dir))

    def exemplar_path(self, relative: str) -> Path:
        return self.data_dir / relative

    def delete_exemplar_files(self, view_id: int) -> None:
        directory = self.exemplars_dir / str(view_id)
        if directory.is_dir():
            for p in directory.iterdir():
                p.unlink(missing_ok=True)
            directory.rmdir()
