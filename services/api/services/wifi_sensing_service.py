import asyncio
import os
from pathlib import Path
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

_wifi_sensing_dir = str(Path(__file__).resolve().parent.parent.parent / "wifi-sensing")
if _wifi_sensing_dir not in sys.path:
    sys.path.insert(0, _wifi_sensing_dir)

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from event_pipeline import SensingPipeline
from hardware_adapter import HardwareSensorAdapter
from models.wifi_sensing import WifiSensingAudit, WifiSensingEvent, WifiSensorConfig
from presence_estimator import BaselinePresenceEstimator
from schemas.wifi_sensing import (
    SensingCapabilitiesResponse,
    SensingEventResponse,
    SensingOccupancySummary,
    SensorCapabilityItem,
    SensorConfigCreate,
    SensorConfigResponse,
    SensorConfigUpdate,
    WifiSensingAuditResponse,
    WifiSensingStatusResponse,
)
from synthetic_simulator import SyntheticSensorSimulator
from sensing_types import NormalizedSensorEvent, utc_now


class WifiSensingService:
    """Orchestrates sensor providers, privacy consent, event persistence, and occupancy summaries."""

    _active_pipelines: Dict[str, SensingPipeline] = {}
    _simulators: Dict[str, SyntheticSensorSimulator] = {}
    _hardware_adapter: HardwareSensorAdapter = HardwareSensorAdapter()

    @classmethod
    def get_simulator(cls, room_id: str) -> SyntheticSensorSimulator:
        if room_id not in cls._simulators:
            cls._simulators[room_id] = SyntheticSensorSimulator(seed=hash(room_id) % 10000)
        return cls._simulators[room_id]

    @classmethod
    def get_pipeline(cls, room_id: str) -> SensingPipeline:
        if room_id not in cls._active_pipelines:
            sim = cls.get_simulator(room_id)
            cls._active_pipelines[room_id] = SensingPipeline(
                provider=sim,
                estimator=BaselinePresenceEstimator(),
                max_buffer_size=100,
            )
        return cls._active_pipelines[room_id]

    # --- Capabilities & Health ---

    @classmethod
    def get_capabilities(cls) -> SensingCapabilitiesResponse:
        sim = cls.get_simulator("probe_room")
        sim_caps = sim.discover_capabilities()
        hw_caps = cls._hardware_adapter.discover_capabilities()

        items = [
            SensorCapabilityItem(
                provider_id=sim_caps.provider_id,
                name=sim_caps.name,
                is_hardware=sim_caps.is_hardware,
                is_simulated=sim_caps.is_simulated,
                is_available=sim_caps.is_available,
                unavailability_reason=sim_caps.unavailability_reason,
                supported_measurements=sim_caps.supported_measurements,
                sampling_rate_hz=sim_caps.sampling_rate_hz,
                requires_authorization=sim_caps.requires_authorization,
            ),
            SensorCapabilityItem(
                provider_id=hw_caps.provider_id,
                name=hw_caps.name,
                is_hardware=hw_caps.is_hardware,
                is_simulated=hw_caps.is_simulated,
                is_available=hw_caps.is_available,
                unavailability_reason=hw_caps.unavailability_reason,
                supported_measurements=hw_caps.supported_measurements,
                sampling_rate_hz=hw_caps.sampling_rate_hz,
                requires_authorization=hw_caps.requires_authorization,
            ),
        ]

        return SensingCapabilitiesResponse(
            providers=items,
            active_provider_id="synthetic_csi_simulator",
            simulation_mode=True,
            hardware_available=hw_caps.is_available,
        )

    @classmethod
    async def get_status(cls, db: AsyncSession, owner_id: str) -> WifiSensingStatusResponse:
        # Check active configs for this owner
        stmt = select(WifiSensorConfig.room_id).where(
            WifiSensorConfig.owner_id == owner_id,
            WifiSensorConfig.is_active == True,
        )
        result = await db.execute(stmt)
        active_rooms = [r[0] for r in result.all()]

        hw_caps = cls._hardware_adapter.discover_capabilities()

        return WifiSensingStatusResponse(
            status="operational",
            service="wifi-sensing-subsystem",
            simulation_mode=True,
            active_simulations_count=len(active_rooms),
            active_rooms=active_rooms,
            hardware_detected=hw_caps.is_available,
            timestamp=utc_now().isoformat(),
        )

    # --- Sensor Configuration CRUD ---

    @classmethod
    async def list_configs(cls, db: AsyncSession, owner_id: str) -> List[WifiSensorConfig]:
        stmt = (
            select(WifiSensorConfig)
            .where(WifiSensorConfig.owner_id == owner_id)
            .order_by(WifiSensorConfig.created_at.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @classmethod
    async def get_config_by_room_id(
        cls, db: AsyncSession, owner_id: str, room_id: str
    ) -> Optional[WifiSensorConfig]:
        stmt = select(WifiSensorConfig).where(
            WifiSensorConfig.owner_id == owner_id,
            WifiSensorConfig.room_id == room_id,
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    @classmethod
    async def get_config_by_id(
        cls, db: AsyncSession, owner_id: str, config_id: str
    ) -> WifiSensorConfig:
        stmt = select(WifiSensorConfig).where(
            WifiSensorConfig.owner_id == owner_id,
            WifiSensorConfig.id == config_id,
        )
        result = await db.execute(stmt)
        cfg = result.scalars().first()
        if not cfg:
            raise KeyError(f"Sensor config '{config_id}' not found.")
        return cfg

    @classmethod
    async def create_config(
        cls, db: AsyncSession, owner_id: str, payload: SensorConfigCreate
    ) -> WifiSensorConfig:
        # Check if room already exists for this owner
        existing = await cls.get_config_by_room_id(db, owner_id, payload.room_id)
        if existing:
            raise ValueError(f"Sensor configuration for room '{payload.room_id}' already exists.")

        now = utc_now()
        cfg = WifiSensorConfig(
            owner_id=owner_id,
            room_id=payload.room_id,
            room_name=payload.room_name,
            is_authorized=payload.is_authorized,
            is_active=False,
            simulation_speed=payload.simulation_speed,
            retention_days=payload.retention_days,
            authorized_at=now if payload.is_authorized else None,
            created_at=now,
            updated_at=now,
        )
        db.add(cfg)

        audit = WifiSensingAudit(
            owner_id=owner_id,
            room_id=payload.room_id,
            action="config_created",
            details={
                "room_name": payload.room_name,
                "is_authorized": payload.is_authorized,
                "retention_days": payload.retention_days,
            },
            created_at=now,
        )
        db.add(audit)
        await db.commit()
        await db.refresh(cfg)
        return cfg

    @classmethod
    async def update_config(
        cls, db: AsyncSession, owner_id: str, config_id: str, payload: SensorConfigUpdate
    ) -> WifiSensorConfig:
        cfg = await cls.get_config_by_id(db, owner_id, config_id)
        now = utc_now()
        changes: Dict[str, Any] = {}

        if payload.room_name is not None and payload.room_name != cfg.room_name:
            cfg.room_name = payload.room_name
            changes["room_name"] = payload.room_name

        if payload.simulation_speed is not None and payload.simulation_speed != cfg.simulation_speed:
            cfg.simulation_speed = payload.simulation_speed
            changes["simulation_speed"] = payload.simulation_speed

        if payload.retention_days is not None and payload.retention_days != cfg.retention_days:
            cfg.retention_days = payload.retention_days
            changes["retention_days"] = payload.retention_days

        if payload.is_authorized is not None and payload.is_authorized != cfg.is_authorized:
            cfg.is_authorized = payload.is_authorized
            changes["is_authorized"] = payload.is_authorized
            if payload.is_authorized:
                cfg.authorized_at = now
            else:
                cfg.authorized_at = None
                # De-authorizing halts active simulation
                if cfg.is_active:
                    cfg.is_active = False
                    changes["deactivated_due_to_deauthorization"] = True
                    pipe = cls.get_pipeline(cfg.room_id)
                    await pipe.provider.stop()

        cfg.updated_at = now

        audit = WifiSensingAudit(
            owner_id=owner_id,
            room_id=cfg.room_id,
            action="config_updated",
            details=changes,
            created_at=now,
        )
        db.add(audit)
        await db.commit()
        await db.refresh(cfg)
        return cfg

    # --- Simulation Lifecycle ---

    @classmethod
    async def start_simulation(
        cls, db: AsyncSession, owner_id: str, room_id: str, speed: float = 1.0
    ) -> WifiSensorConfig:
        cfg = await cls.get_config_by_room_id(db, owner_id, room_id)
        if not cfg:
            raise KeyError(f"No configured sensor room '{room_id}' for this user.")

        if not cfg.is_authorized:
            raise ValueError(
                f"Consent required: Room '{room_id}' has not been authorized for sensing. "
                "Explicit operator authorization must be granted before starting."
            )

        now = utc_now()
        cfg.is_active = True
        cfg.simulation_speed = speed
        cfg.updated_at = now

        pipe = cls.get_pipeline(room_id)
        await pipe.provider.start(room_id=room_id, speed=speed)

        # Emit initial observation tick immediately
        event_data: Optional[NormalizedSensorEvent] = await pipe.step()
        if event_data:
            db_event = WifiSensingEvent(
                config_id=cfg.id,
                owner_id=owner_id,
                room_id=room_id,
                timestamp=event_data.timestamp,
                is_simulated=True,
                sensor_type=event_data.sensor_type,
                presence_state=event_data.presence_state,
                presence_probability=event_data.presence_probability,
                motion_level=event_data.motion_level,
                signal_strength_dbm=event_data.signal_strength_dbm,
                sample_count=event_data.sample_count,
                quality_score=event_data.quality_score,
                raw_metrics=event_data.raw_metrics,
            )
            db.add(db_event)

        audit = WifiSensingAudit(
            owner_id=owner_id,
            room_id=room_id,
            action="session_started",
            details={"simulation_speed": speed, "is_simulated": True},
            created_at=now,
        )
        db.add(audit)
        await db.commit()
        await db.refresh(cfg)
        return cfg

    @classmethod
    async def stop_simulation(
        cls, db: AsyncSession, owner_id: str, room_id: str
    ) -> WifiSensorConfig:
        cfg = await cls.get_config_by_room_id(db, owner_id, room_id)
        if not cfg:
            raise KeyError(f"No configured sensor room '{room_id}' for this user.")

        now = utc_now()
        cfg.is_active = False
        cfg.updated_at = now

        pipe = cls.get_pipeline(room_id)
        await pipe.provider.stop()

        audit = WifiSensingAudit(
            owner_id=owner_id,
            room_id=room_id,
            action="session_stopped",
            details={"stopped_at": now.isoformat()},
            created_at=now,
        )
        db.add(audit)
        await db.commit()
        await db.refresh(cfg)
        return cfg

    @classmethod
    async def reset_simulation(
        cls, db: AsyncSession, owner_id: str, room_id: str
    ) -> WifiSensorConfig:
        cfg = await cls.get_config_by_room_id(db, owner_id, room_id)
        if not cfg:
            raise KeyError(f"No configured sensor room '{room_id}' for this user.")

        pipe = cls.get_pipeline(room_id)
        await pipe.provider.reset()
        pipe.clear_buffer()

        now = utc_now()
        audit = WifiSensingAudit(
            owner_id=owner_id,
            room_id=room_id,
            action="session_reset",
            details={"reset_at": now.isoformat()},
            created_at=now,
        )
        db.add(audit)
        await db.commit()
        return cfg

    @classmethod
    async def step_simulation(
        cls, db: AsyncSession, owner_id: str, room_id: str
    ) -> Optional[WifiSensingEvent]:
        cfg = await cls.get_config_by_room_id(db, owner_id, room_id)
        if not cfg or not cfg.is_active or not cfg.is_authorized:
            return None

        pipe = cls.get_pipeline(room_id)
        event_data: Optional[NormalizedSensorEvent] = await pipe.step()
        if not event_data:
            return None

        db_event = WifiSensingEvent(
            config_id=cfg.id,
            owner_id=owner_id,
            room_id=room_id,
            timestamp=event_data.timestamp,
            is_simulated=True,
            sensor_type=event_data.sensor_type,
            presence_state=event_data.presence_state,
            presence_probability=event_data.presence_probability,
            motion_level=event_data.motion_level,
            signal_strength_dbm=event_data.signal_strength_dbm,
            sample_count=event_data.sample_count,
            quality_score=event_data.quality_score,
            raw_metrics=event_data.raw_metrics,
        )
        db.add(db_event)
        await db.commit()
        await db.refresh(db_event)
        return db_event

    # --- Querying Events ---

    @classmethod
    async def list_events(
        cls,
        db: AsyncSession,
        owner_id: str,
        room_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[WifiSensingEvent], int]:
        conditions = [WifiSensingEvent.owner_id == owner_id]
        if room_id:
            conditions.append(WifiSensingEvent.room_id == room_id)
        if start_time:
            conditions.append(WifiSensingEvent.timestamp >= start_time)
        if end_time:
            conditions.append(WifiSensingEvent.timestamp <= end_time)

        # Count
        count_stmt = select(func.count(WifiSensingEvent.id)).where(*conditions)
        count_res = await db.execute(count_stmt)
        total = count_res.scalar() or 0

        # Query
        stmt = (
            select(WifiSensingEvent)
            .where(*conditions)
            .order_by(WifiSensingEvent.timestamp.desc())
            .limit(limit)
            .offset(offset)
        )
        res = await db.execute(stmt)
        return list(res.scalars().all()), total

    @classmethod
    async def get_occupancy_summary(
        cls, db: AsyncSession, owner_id: str, room_id: str
    ) -> SensingOccupancySummary:
        cfg = await cls.get_config_by_room_id(db, owner_id, room_id)
        if not cfg:
            raise KeyError(f"No configured sensor room '{room_id}' for this user.")

        # Aggregate events
        stmt = (
            select(WifiSensingEvent)
            .where(
                WifiSensingEvent.owner_id == owner_id,
                WifiSensingEvent.room_id == room_id,
            )
            .order_by(WifiSensingEvent.timestamp.desc())
            .limit(100)
        )
        res = await db.execute(stmt)
        events = list(res.scalars().all())

        if not events:
            return SensingOccupancySummary(
                room_id=room_id,
                is_simulated=True,
                total_events=0,
                current_state="unknown",
                current_probability=None,
                average_signal_dbm=-65.0,
                state_breakdown={"vacant": 0, "presence": 0, "motion": 0, "unknown": 0},
                last_event_time=None,
            )

        latest = events[0]
        breakdown = {"vacant": 0, "presence": 0, "motion": 0, "unknown": 0}
        total_rssi = 0.0
        for ev in events:
            breakdown[ev.presence_state] = breakdown.get(ev.presence_state, 0) + 1
            total_rssi += ev.signal_strength_dbm

        avg_rssi = round(total_rssi / len(events), 2)

        return SensingOccupancySummary(
            room_id=room_id,
            is_simulated=True,
            total_events=len(events),
            current_state=latest.presence_state,
            current_probability=latest.presence_probability,
            average_signal_dbm=avg_rssi,
            state_breakdown=breakdown,
            last_event_time=latest.timestamp,
        )

    # --- Retention & Purge ---

    @classmethod
    async def purge_events(
        cls,
        db: AsyncSession,
        owner_id: str,
        room_id: Optional[str] = None,
        before_date: Optional[datetime] = None,
    ) -> int:
        conditions = [WifiSensingEvent.owner_id == owner_id]
        if room_id:
            conditions.append(WifiSensingEvent.room_id == room_id)
        if before_date:
            conditions.append(WifiSensingEvent.timestamp < before_date)

        # Count events to delete
        count_stmt = select(func.count(WifiSensingEvent.id)).where(*conditions)
        c_res = await db.execute(count_stmt)
        to_delete = c_res.scalar() or 0

        if to_delete > 0:
            del_stmt = delete(WifiSensingEvent).where(*conditions)
            await db.execute(del_stmt)

        audit = WifiSensingAudit(
            owner_id=owner_id,
            room_id=room_id,
            action="history_purged",
            details={
                "purged_count": to_delete,
                "room_id": room_id,
                "before_date": before_date.isoformat() if before_date else None,
            },
            created_at=utc_now(),
        )
        db.add(audit)
        await db.commit()
        return to_delete

    @classmethod
    async def apply_retention_policy(cls, db: AsyncSession, owner_id: str) -> int:
        configs = await cls.list_configs(db, owner_id)
        total_purged = 0
        now = utc_now()

        for cfg in configs:
            cutoff = now - timedelta(days=cfg.retention_days)
            purged = await cls.purge_events(db, owner_id, room_id=cfg.room_id, before_date=cutoff)
            total_purged += purged

        return total_purged

    # --- Audit Logs ---

    @classmethod
    async def list_audit_logs(
        cls, db: AsyncSession, owner_id: str, limit: int = 50, offset: int = 0
    ) -> List[WifiSensingAudit]:
        stmt = (
            select(WifiSensingAudit)
            .where(WifiSensingAudit.owner_id == owner_id)
            .order_by(WifiSensingAudit.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())
