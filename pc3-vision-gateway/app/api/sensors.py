from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_sensor_service
from app.schemas.sensor import SensorUpdateRequest, SensorUpdateResponse
from app.sensors.sensor_service import SensorService


router = APIRouter(prefix="/api/sensors", tags=["sensors"])


@router.post("/update", response_model=SensorUpdateResponse)
def update_sensor(
    request: SensorUpdateRequest,
    sensor_service: SensorService = Depends(get_sensor_service),
) -> SensorUpdateResponse:
    environment = sensor_service.update_environment(request)
    return SensorUpdateResponse(status="updated", environment=environment)
