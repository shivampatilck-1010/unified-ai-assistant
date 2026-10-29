from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from routers.deps import get_current_user_id
from schemas.wifi_sensing import (
    SensingCapabilitiesResponse,
    SensingEventListResponse,
    SensingEventResponse,
    SensingOccupancySummary,
    SensingPurgeRequest,
    SensingPurgeResponse,
    SensorConfigCreate,
    SensorConfigResponse,
    SensorConfigUpdate,
    SimulationControlRequest,
    SimulationControlResponse,
    WifiSensingAuditResponse,
    WifiSensingStatusResponse,
)
from services.wifi_sensing_service import WifiSensingService

router = APIRouter(prefix="/api/sensing", tags=["Wi-Fi Sensing"])


@router.get("/status", response_model=WifiSensingStatusResponse)
async def get_sensing_status(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> WifiSensingStatusResponse:
    """Returns runtime status of the sensing subsystem, active simulations, and hardware availability."""
    return await WifiSensingService.get_status(db, owner_id=user_id)


@router.get("/capabilities", response_model=SensingCapabilitiesResponse)
def get_sensing_capabilities() -> SensingCapabilitiesResponse:
    """Discovers available sensor providers, distinguishing synthetic simulators from physical adapters."""
    return WifiSensingService.get_capabilities()


@router.get("/configs", response_model=List[SensorConfigResponse])
async def list_sensor_configs(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> List[SensorConfigResponse]:
    """Lists authorized sensor room configurations belonging to the authenticated user."""
    configs = await WifiSensingService.list_configs(db, owner_id=user_id)
    return [SensorConfigResponse.model_validate(c) for c in configs]


@router.post("/configs", response_model=SensorConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_sensor_config(
    payload: SensorConfigCreate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> SensorConfigResponse:
    """Registers an authorized sensing zone with explicit operator consent."""
    try:
        cfg = await WifiSensingService.create_config(db, owner_id=user_id, payload=payload)
        return SensorConfigResponse.model_validate(cfg)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.patch("/configs/{config_id}", response_model=SensorConfigResponse)
async def update_sensor_config(
    config_id: str,
    payload: SensorConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> SensorConfigResponse:
    """Updates configuration parameters, consent status, or retention window for a sensing zone."""
    try:
        cfg = await WifiSensingService.update_config(db, owner_id=user_id, config_id=config_id, payload=payload)
        return SensorConfigResponse.model_validate(cfg)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/simulation/start", response_model=SimulationControlResponse)
async def start_simulation(
    payload: SimulationControlRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> SimulationControlResponse:
    """Starts synthetic simulation or real physical RSSI monitoring for an explicitly authorized room."""
    try:
        speed = payload.speed or 1.0
        provider_id = payload.provider_id or "synthetic_csi_simulator"
        cfg = await WifiSensingService.start_simulation(
            db, owner_id=user_id, room_id=payload.room_id, speed=speed, provider_id=provider_id
        )
        is_real_rssi = provider_id == "real_wifi_rssi_hardware"
        msg = (
            f"Real Wi-Fi RSSI monitoring started for room '{cfg.room_name}'."
            if is_real_rssi
            else f"Synthetic CSI simulation started for room '{cfg.room_name}' at {cfg.simulation_speed}x speed."
        )
        return SimulationControlResponse(
            room_id=cfg.room_id,
            is_active=cfg.is_active,
            simulation_mode=not is_real_rssi,
            action="started",
            speed=cfg.simulation_speed,
            message=msg,
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/simulation/stop", response_model=SimulationControlResponse)
async def stop_simulation(
    payload: SimulationControlRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> SimulationControlResponse:
    """Halts synthetic CSI data generation for a room."""
    try:
        cfg = await WifiSensingService.stop_simulation(db, owner_id=user_id, room_id=payload.room_id)
        return SimulationControlResponse(
            room_id=cfg.room_id,
            is_active=cfg.is_active,
            simulation_mode=True,
            action="stopped",
            speed=cfg.simulation_speed,
            message=f"Synthetic CSI simulation stopped for room '{cfg.room_name}'.",
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/simulation/reset", response_model=SimulationControlResponse)
async def reset_simulation(
    payload: SimulationControlRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> SimulationControlResponse:
    """Resets synthetic simulation tick counter, buffers, and state schedule."""
    try:
        cfg = await WifiSensingService.reset_simulation(db, owner_id=user_id, room_id=payload.room_id)
        return SimulationControlResponse(
            room_id=cfg.room_id,
            is_active=cfg.is_active,
            simulation_mode=True,
            action="reset",
            speed=cfg.simulation_speed,
            message=f"Synthetic CSI simulation reset for room '{cfg.room_name}'.",
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/simulation/step", response_model=Optional[SensingEventResponse])
async def step_simulation(
    payload: SimulationControlRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> Optional[SensingEventResponse]:
    """Generates and persists an individual deterministic observation tick for active simulation."""
    event = await WifiSensingService.step_simulation(db, owner_id=user_id, room_id=payload.room_id)
    if not event:
        return None
    return SensingEventResponse.model_validate(event)


@router.get("/events", response_model=SensingEventListResponse)
async def list_events(
    room_id: Optional[str] = Query(None, description="Filter by room ID"),
    start_time: Optional[datetime] = Query(None, description="Start timestamp in UTC"),
    end_time: Optional[datetime] = Query(None, description="End timestamp in UTC"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> SensingEventListResponse:
    """Returns paginated normalized sensor observations with explicit simulation labeling."""
    events, total = await WifiSensingService.list_events(
        db,
        owner_id=user_id,
        room_id=room_id,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
        offset=offset,
    )
    return SensingEventListResponse(
        events=[SensingEventResponse.model_validate(e) for e in events],
        total=total,
        room_id=room_id,
        simulation_mode=True,
    )


@router.get("/summary", response_model=SensingOccupancySummary)
async def get_occupancy_summary(
    room_id: str = Query(..., min_length=1, description="Room ID for summary aggregation"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> SensingOccupancySummary:
    """Computes aggregated occupancy trends and state distribution from retained observations."""
    try:
        return await WifiSensingService.get_occupancy_summary(db, owner_id=user_id, room_id=room_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/events", response_model=SensingPurgeResponse)
async def purge_sensing_events(
    payload: Optional[SensingPurgeRequest] = None,
    room_id: Optional[str] = Query(None),
    before_date: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> SensingPurgeResponse:
    """Purges retained sensor event history for privacy compliance and storage hygiene."""
    target_room = payload.room_id if payload else room_id
    target_before = payload.before_date if payload else before_date

    count = await WifiSensingService.purge_events(
        db, owner_id=user_id, room_id=target_room, before_date=target_before
    )
    return SensingPurgeResponse(
        purged_count=count,
        message=f"Successfully purged {count} retained sensing event(s).",
    )


@router.get("/audit", response_model=List[WifiSensingAuditResponse])
async def list_audit_trail(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> List[WifiSensingAuditResponse]:
    """Returns immutable audit logs detailing consent authorization and lifecycle events."""
    audits = await WifiSensingService.list_audit_logs(db, owner_id=user_id, limit=limit, offset=offset)
    return [WifiSensingAuditResponse.model_validate(a) for a in audits]
