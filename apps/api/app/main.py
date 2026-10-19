from __future__ import annotations

import asyncio
import logging
import shutil
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.catalog import CameraCatalog
from app.config import Settings, get_settings
from app.detection import build_detector
from app.frames import FrameStore
from app.monitor import CameraMonitor, CameraState, Emit, MonitorConfig, WatchManager
from app.pipeline import Analyzer
from app.repository import Repository
from app.routes_cameras import router as cameras_router
from app.routes_catalog import router as catalog_router
from app.routes_state import router as state_router
from app.routes_views import router as views_router
from app.routes_zones import router as zones_router
from app.services import Services, validate_client_id
from app.source import SourceFetcher
from app.view_registry import ViewRegistry
from app.views import MatcherConfig, ViewMatcher
from app.ws import router as ws_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def build_services(
    settings: Settings, http: httpx.AsyncClient, public_http: httpx.AsyncClient
) -> Services:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    # Old session images are disposable; browsers restore references on reconnect.
    shutil.rmtree(settings.data_dir / "sessions", ignore_errors=True)
    repo = Repository()
    shared_frames = settings.data_dir / "frames"
    store = FrameStore(
        settings.data_dir / "sessions" / "legacy", settings.frame_retention, shared_frames
    )
    fetcher = SourceFetcher(
        http, settings.source_url_template, settings.fetch_timeout_seconds, public_http
    )
    config = MonitorConfig(
        poll_interval=settings.poll_interval_seconds,
        max_backoff=settings.max_backoff_seconds,
        offline_after_failures=settings.offline_after_failures,
    )

    matcher = ViewMatcher(
        MatcherConfig(
            mask=settings.view_mask,
            min_inliers=settings.view_min_inliers,
            min_inlier_ratio=settings.view_min_inlier_ratio,
        )
    )
    views = ViewRegistry(repo, store, matcher, settings.view_mask, settings.view_max_exemplars)
    prediction_slots = asyncio.Semaphore(settings.max_concurrent_predictions)

    def analyzer_for(token: str | None) -> Analyzer:
        return Analyzer(settings, repo, views, build_detector(settings, token, prediction_slots))

    sessions: dict[str, Services] = {}
    expiry_handles: dict[str, asyncio.TimerHandle] = {}
    sessions_lock = threading.RLock()

    def session_for(client_id: str) -> Services:
        validate_client_id(client_id)
        if not client_id:
            return root
        with sessions_lock:
            if handle := expiry_handles.pop(client_id, None):
                handle.cancel()
            if client_id not in sessions:
                session_repo = Repository()
                session_store = FrameStore(
                    settings.data_dir / "sessions" / client_id,
                    settings.frame_retention, store.frames_dir,
                )
                session_views = ViewRegistry(
                    session_repo, session_store, matcher, settings.view_mask,
                    settings.view_max_exemplars,
                )
                sessions[client_id] = Services(
                    settings=settings, http=http, repo=session_repo, store=session_store,
                    fetcher=SourceFetcher(
                        http, settings.source_url_template, settings.fetch_timeout_seconds,
                        public_http,
                    ),
                    manager=root.manager, views=session_views,
                    analyzer_for=lambda token, r=session_repo, v=session_views: Analyzer(
                        settings, r, v, build_detector(settings, token, prediction_slots)
                    ),
                    client_id=client_id,
                )
            return sessions[client_id]

    def monitor_factory(
        camera_id: str, token: str | None, state: CameraState, emit: Emit,
        client_id: str = "",
    ) -> CameraMonitor:
        session = session_for(client_id)
        analyzer = session.analyzer_for(token)
        return CameraMonitor(
            camera_id, session.fetcher, session.store, analyzer, emit, state, config,
            analyzer.forget_detections
        )

    def expire_session(client_id: str) -> None:
        with sessions_lock:
            expiry_handles.pop(client_id, None)
            session = sessions.pop(client_id, None)
        if session:
            shutil.rmtree(session.store.data_dir, ignore_errors=True)

    def release_session(client_id: str) -> None:
        with sessions_lock:
            if handle := expiry_handles.pop(client_id, None):
                handle.cancel()
            expiry_handles[client_id] = asyncio.get_running_loop().call_later(
                300, expire_session, client_id
            )

    root = Services(
        settings=settings,
        http=http,
        repo=repo,
        store=store,
        fetcher=fetcher,
        manager=WatchManager(monitor_factory, on_client_idle=release_session),
        views=views,
        analyzer_for=analyzer_for,
        session_for=session_for,
    )
    return root


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with (
            httpx.AsyncClient(follow_redirects=True) as http,
            httpx.AsyncClient(
                follow_redirects=False,
                trust_env=False,
                limits=httpx.Limits(max_keepalive_connections=0),
            ) as public_http,
        ):
            services = build_services(settings, http, public_http)
            app.state.services = services
            app.state.catalog = CameraCatalog(http, settings.source_url_template)
            try:
                yield
            finally:
                await services.manager.shutdown()

    app = FastAPI(title="FreePark API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origin.split(",") if o.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(cameras_router)
    app.include_router(catalog_router)
    app.include_router(state_router)
    app.include_router(views_router)
    app.include_router(zones_router)
    app.include_router(ws_router)
    return app


app = create_app()
