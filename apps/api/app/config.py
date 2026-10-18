from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (and `.env`)."""

    # `.env` next to the API or at the monorepo root (later files take priority)
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")

    api_port: int = 4000
    cors_origin: str = "http://localhost:5173"
    data_dir: Path = Path("./data")

    # Camera source
    source_url_template: str = "https://camaras.vigo.org/webcam/cam.php?id={id}"
    poll_interval_seconds: float = 5.0
    max_backoff_seconds: float = 60.0
    offline_after_failures: int = 3
    fetch_timeout_seconds: float = 10.0
    frame_retention: int = 20

    # Detection
    detector: Literal["replicate", "fake"] = "replicate"
    replicate_model: str = (
        "adirik/grounding-dino:efd10a8ddc57ea28773327e881ce95e20cc1d734c589f7dd01d2036921ed78aa"
    )
    replicate_input_template: str = (
        '{"image": "{image}", "query": "car", "box_threshold": 0.15, '
        '"text_threshold": 0.15, "show_visualisation": false}'
    )
    replicate_output_format: Literal["grounding_dino", "yolo"] = "grounding_dino"
    replicate_timeout_seconds: float = 90.0
    detection_upscale: float = 3.0
    detection_min_confidence: float = 0.15
    detection_max_box_area: float = 0.2
    max_concurrent_predictions: int = 4
    fake_detections_file: Path | None = None

    # View recognition / quality
    view_mask: Annotated[tuple[float, float, float, float], NoDecode] = (0.0, 0.0, 1.0, 0.09)
    view_min_inliers: int = 25
    view_min_inlier_ratio: float = 0.25
    view_max_exemplars: int = 5
    blur_threshold: float = 1.0
    dark_threshold: float = 25.0

    # Occupancy
    available_confirm_frames: int = Field(default=2, ge=1)
    gap_margin: float = 1.15

    @field_validator("view_mask", mode="before")
    @classmethod
    def _parse_mask(cls, value: object) -> object:
        if isinstance(value, str):
            parts = [float(p) for p in value.split(",")]
            if len(parts) != 4:
                raise ValueError("VIEW_MASK must be 'x,y,w,h'")
            return tuple(parts)
        return value

    @field_validator(
        "replicate_input_template", "replicate_model", "replicate_output_format", mode="before"
    )
    @classmethod
    def _blank_uses_default(cls, value: object, info) -> object:
        if value in ("", None):
            return cls.model_fields[info.field_name].default
        return value

    @property
    def frames_dir(self) -> Path:
        return self.data_dir / "frames"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "parking.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
