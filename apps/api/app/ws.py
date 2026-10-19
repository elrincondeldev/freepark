"""WebSocket endpoint: clients subscribe to cameras and receive live updates (design D2)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.camera_ids import InvalidCameraId, normalize_camera_id

log = logging.getLogger(__name__)
router = APIRouter()

MAX_CAMERAS_PER_CLIENT = 24


class SocketConnection:
    """Adapter so the watch manager can push JSON to a socket; hashable by identity."""

    def __init__(self, ws: WebSocket) -> None:
        self.ws = ws

    async def send_json(self, data) -> None:
        await self.ws.send_json(data)


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    manager = ws.app.state.services.manager
    conn = SocketConnection(ws)
    try:
        while True:
            msg = await ws.receive_json()
            if not isinstance(msg, dict) or msg.get("type") != "subscribe":
                await conn.send_json({"type": "error", "message": "unknown message"})
                continue
            raw = msg.get("cameras")
            if not isinstance(raw, list) or len(raw) > MAX_CAMERAS_PER_CLIENT:
                await conn.send_json({"type": "error", "message": "invalid camera list"})
                continue
            cameras: set[str] = set()
            for item in raw:
                try:
                    cameras.add(normalize_camera_id(str(item)))
                except InvalidCameraId:
                    continue
            token = msg.get("replicateApiKey")
            if token is not None and (
                not isinstance(token, str)
                or len(token) > 512
                or any(char.isspace() for char in token)
            ):
                await conn.send_json({"type": "error", "message": "invalid Replicate API key"})
                continue
            token = token or None
            client_id = msg.get("clientId", "")
            if not isinstance(client_id, str) or (client_id and (
                len(client_id) > 64 or not client_id.isascii() or not client_id.isalnum()
            )):
                await conn.send_json({"type": "error", "message": "invalid client id"})
                continue
            added = await manager.set_subscriptions(conn, cameras, token, client_id)
            await conn.send_json({"type": "subscribed", "cameras": sorted(cameras)})
            for camera_id in sorted(added):
                for replay in manager.replay(camera_id, token, client_id):
                    await conn.send_json(replay)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("websocket error")
    finally:
        await manager.disconnect(conn)
