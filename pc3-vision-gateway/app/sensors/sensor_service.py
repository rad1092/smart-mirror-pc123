from __future__ import annotations

from app.schemas.sensor import EnvironmentFeature
from app.storage.memory_store import MemoryStore


class SensorService:
    def __init__(self, store: MemoryStore) -> None:
        self._store = store

    def update_environment(self, environment: EnvironmentFeature) -> EnvironmentFeature:
        return self._store.update_environment(environment)

    def get_environment(self) -> EnvironmentFeature:
        return self._store.get_environment()
