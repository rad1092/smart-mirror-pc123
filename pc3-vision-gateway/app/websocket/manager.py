from __future__ import annotations

import logging

from fastapi import WebSocket


logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._active_connections: dict[str, set[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._active_connections.setdefault(session_id, set()).add(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        connections = self._active_connections.get(session_id)
        if not connections:
            return
        connections.discard(websocket)
        if not connections:
            self._active_connections.pop(session_id, None)

    async def broadcast(self, session_id: str, message: dict) -> None:
        connections = list(self._active_connections.get(session_id, set()))
        for websocket in connections:
            try:
                await websocket.send_json(message)
            except Exception:
                logger.exception("Failed to send websocket message for session %s", session_id)
                self.disconnect(session_id, websocket)


manager = ConnectionManager()
