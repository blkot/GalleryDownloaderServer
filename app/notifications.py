from __future__ import annotations

import asyncio
import json
from typing import Any, Iterable, Set

from fastapi import WebSocket


class NotificationManager:
    """Track active WebSocket connections and broadcast download events."""

    def __init__(self) -> None:
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept the connection and track the websocket instance."""
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        """Remove a connection that has closed or failed."""
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Send a JSON message to every active connection."""
        payload = json.dumps(message, default=_json_fallback)
        async with self._lock:
            targets: Iterable[WebSocket] = list(self._connections)

        for websocket in targets:
            try:
                await websocket.send_text(payload)
            except Exception:
                await self.disconnect(websocket)


def _json_fallback(value: Any) -> str:
    """Fallback serializer for otherwise non-serializable values."""
    return str(value)


notification_manager = NotificationManager()

