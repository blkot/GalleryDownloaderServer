from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.config import settings
from app.notifications import notification_manager

router = APIRouter()


async def _extract_token(websocket: WebSocket) -> Optional[str]:
    """Return the bearer token from header or query string, if provided."""
    auth_header = websocket.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return websocket.query_params.get("token")


@router.websocket("/ws/notifications")
async def notifications_endpoint(websocket: WebSocket) -> None:
    """Stream download notifications to connected clients."""
    token = await _extract_token(websocket)
    if token != settings.api_token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return

    await notification_manager.connect(websocket)
    try:
        await websocket.send_json({"type": "welcome", "message": "notifications-ready"})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        await websocket.close(code=1011)
    finally:
        await notification_manager.disconnect(websocket)
