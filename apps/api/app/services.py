"""Application service container, created in the FastAPI lifespan."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

import httpx
from fastapi import Request

from app.config import Settings
from app.db import Repository
from app.frames import FrameStore
from app.monitor import WatchManager
from app.source import SourceFetcher
from app.view_registry import ViewRegistry

if TYPE_CHECKING:
    from app.pipeline import Analyzer


@dataclass
class Services:
    settings: Settings
    http: httpx.AsyncClient
    repo: Repository
    store: FrameStore
    fetcher: SourceFetcher
    manager: WatchManager
    views: ViewRegistry
    analyzer_for: Callable[[str | None], Analyzer]

    def views_changed(self, camera_id: str) -> None:
        """Views or zones of a camera changed: re-analyse its latest frame."""
        self.views.invalidate(camera_id)
        self.manager.requeue_all(camera_id)


def get_services(request: Request) -> Services:
    return request.app.state.services
