"""Application service container, created in the FastAPI lifespan."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

import httpx
from fastapi import HTTPException, Request

from app.config import Settings
from app.frames import FrameStore
from app.monitor import WatchManager
from app.repository import Repository
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
    client_id: str = ""
    session_for: Callable[[str], Services] | None = None
    initialized: bool = False

    def views_changed(self, camera_id: str) -> None:
        """Views or zones of a camera changed: re-analyse its latest frame."""
        self.views.invalidate(camera_id)
        self.manager.requeue_all(camera_id, self.client_id)


def validate_client_id(client_id: str) -> str:
    if client_id and (len(client_id) > 64 or not client_id.isascii() or not client_id.isalnum()):
        raise HTTPException(400, "invalid client id")
    return client_id


def get_services(request: Request) -> Services:
    root: Services = request.app.state.services
    client_id = validate_client_id(request.headers.get("x-client-id", ""))
    return root.session_for(client_id) if root.session_for else root
