from __future__ import annotations

from pydantic import BaseModel


class EnvironmentFeature(BaseModel):
    temperature: float | None = None
    humidity: float | None = None
    illuminance: float | None = None


class SensorUpdateRequest(EnvironmentFeature):
    pass


class SensorUpdateResponse(BaseModel):
    status: str
    environment: EnvironmentFeature
