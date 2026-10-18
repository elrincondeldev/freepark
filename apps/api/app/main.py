from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.db import Repository
from app.detection import build_detector
from app.frames import FrameStore
from app.monitor import CameraMonitor, CameraState, Emit, MonitorConfig, WatchManager
from app.pipeline import Analyzer
from app.routes_cameras import router as cameras_router
from app.routes_views import router as views_router
from app.routes_zones import router as zones_router
from app.services import Services
from app.source import SourceFetcher
from app.view_registry import ViewRegistry
from app.views import MatcherConfig, ViewMatcher
from app.ws import router as ws_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def build_services(settings: Settings, http: httpx.AsyncClient) -> Services:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    repo = Repository(settings.db_path)
    store = FrameStore(settings.data_dir, settings.frame_retention)
    fetcher = SourceFetcher(http, settings.source_url_template, settings.fetch_timeout_seconds)
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

    def monitor_factory(
        camera_id: str, token: str | None, state: CameraState, emit: Emit
    ) -> CameraMonitor:
        analyzer = analyzer_for(token)
        return CameraMonitor(
            camera_id, fetcher, store, analyzer, emit, state, config, analyzer.forget_detections
        )

    return Services(
        settings=settings,
        http=http,
        repo=repo,
        store=store,
        fetcher=fetcher,
        manager=WatchManager(monitor_factory),
        views=views,
        analyzer_for=analyzer_for,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with httpx.AsyncClient(follow_redirects=True) as http:
            services = build_services(settings, http)
            app.state.services = services
            try:
                yield
            finally:
                await services.manager.shutdown()
                services.repo.close()

    app = FastAPI(title="Parking Vision API", version="0.1.0", lifespan=lifespan)
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
    app.include_router(views_router)
    app.include_router(zones_router)
    app.include_router(ws_router)
    return app


app = create_app()
