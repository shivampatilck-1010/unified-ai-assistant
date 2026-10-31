import asyncio
import json
import os
from pathlib import Path
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

_wifi_sensing_dir = str(Path(__file__).resolve().parent.parent.parent / "wifi-sensing")
if _wifi_sensing_dir not in sys.path:
    sys.path.insert(0, _wifi_sensing_dir)

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from event_pipeline import SensingPipeline
from hardware_adapter import HardwareSensorAdapter
from real_rssi_adapter import RealRssiSensorAdapter
from models.wifi_sensing import WifiSensingAudit, WifiSensingEvent, WifiSensorConfig
from presence_estimator import BaselinePresenceEstimator
from schemas.wifi_sensing import (
    Esp32HardwareStatusResponse,
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
from esp32_csi_adapter import Esp32CsiHardwareAdapter
from wifi_3d_fusion_adapter import Wifi3DFusionAdapter
from sensing_types import NormalizedSensorEvent, utc_now


class WifiSensingService:
    """Orchestrates sensor providers, privacy consent, event persistence, and occupancy summaries."""

    _active_pipelines: Dict[str, SensingPipeline] = {}
    _simulators: Dict[str, SyntheticSensorSimulator] = {}
    _hardware_adapter: HardwareSensorAdapter = HardwareSensorAdapter()
    _esp32_csi_adapter: Esp32CsiHardwareAdapter = Esp32CsiHardwareAdapter()
    _wifi_3d_fusion_adapter: Wifi3DFusionAdapter = Wifi3DFusionAdapter()
    _real_rssi_adapter: RealRssiSensorAdapter = RealRssiSensorAdapter()
    _room_providers: Dict[str, str] = {}

    @classmethod
    def get_simulator(cls, room_id: str) -> SyntheticSensorSimulator:
        if room_id not in cls._simulators:
            cls._simulators[room_id] = SyntheticSensorSimulator(seed=hash(room_id) % 10000)
        return cls._simulators[room_id]

    @classmethod
    def get_pipeline(cls, room_id: str, provider_id: Optional[str] = None) -> SensingPipeline:
        target_provider = provider_id or cls._room_providers.get(room_id, "synthetic_csi_simulator")
        cls._room_providers[room_id] = target_provider

        # Check if pipeline already exists for this room with matching provider
        current_pipe = cls._active_pipelines.get(room_id)
        if current_pipe and current_pipe.provider.provider_id == target_provider:
            return current_pipe

        if target_provider == "wifi_3d_fusion_engine":
            provider = cls._wifi_3d_fusion_adapter
        elif target_provider == "esp32_csi_hardware":
            provider = cls._esp32_csi_adapter
        elif target_provider == "real_wifi_rssi_hardware":
            provider = cls._real_rssi_adapter
        elif target_provider == "physical_csi_hardware":
            provider = cls._hardware_adapter
        else:
            provider = cls.get_simulator(room_id)

        cls._active_pipelines[room_id] = SensingPipeline(
            provider=provider,
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
        esp_caps = cls._esp32_csi_adapter.discover_capabilities()
        fusion_caps = cls._wifi_3d_fusion_adapter.discover_capabilities()
        rssi_caps = cls._real_rssi_adapter.discover_capabilities()

        items = [
            SensorCapabilityItem(
                provider_id=fusion_caps.provider_id,
                name=fusion_caps.name,
                is_hardware=fusion_caps.is_hardware,
                is_simulated=fusion_caps.is_simulated,
                is_available=fusion_caps.is_available,
                unavailability_reason=fusion_caps.unavailability_reason,
                supported_measurements=fusion_caps.supported_measurements,
                sampling_rate_hz=fusion_caps.sampling_rate_hz,
                requires_authorization=fusion_caps.requires_authorization,
            ),
            SensorCapabilityItem(
                provider_id=esp_caps.provider_id,
                name=esp_caps.name,
                is_hardware=esp_caps.is_hardware,
                is_simulated=esp_caps.is_simulated,
                is_available=esp_caps.is_available,
                unavailability_reason=esp_caps.unavailability_reason,
                supported_measurements=esp_caps.supported_measurements,
                sampling_rate_hz=esp_caps.sampling_rate_hz,
                requires_authorization=esp_caps.requires_authorization,
            ),
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
                provider_id=rssi_caps.provider_id,
                name=rssi_caps.name,
                is_hardware=rssi_caps.is_hardware,
                is_simulated=rssi_caps.is_simulated,
                is_available=rssi_caps.is_available,
                unavailability_reason=rssi_caps.unavailability_reason,
                supported_measurements=rssi_caps.supported_measurements,
                sampling_rate_hz=rssi_caps.sampling_rate_hz,
                requires_authorization=rssi_caps.requires_authorization,
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

        active_prov = cls._room_providers.get("default", "synthetic_csi_simulator")
        is_hw_any = esp_caps.is_available or hw_caps.is_available or rssi_caps.is_available

        return SensingCapabilitiesResponse(
            providers=items,
            active_provider_id=active_prov,
            simulation_mode=(active_prov == "synthetic_csi_simulator"),
            hardware_available=is_hw_any,
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

        esp_caps = cls._esp32_csi_adapter.discover_capabilities()
        hw_caps = cls._hardware_adapter.discover_capabilities()
        rssi_caps = cls._real_rssi_adapter.discover_capabilities()

        return WifiSensingStatusResponse(
            status="operational",
            service="wifi-sensing-subsystem",
            simulation_mode=True,
            active_simulations_count=len(active_rooms),
            active_rooms=active_rooms,
            hardware_detected=(esp_caps.is_available or hw_caps.is_available or rssi_caps.is_available),
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

        if payload.calibration_profile is not None:
            cfg.calibration_profile = payload.calibration_profile
            changes["calibration_profile"] = "updated"

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

    # --- Calibration Workflow ---

    @classmethod
    async def get_calibration(cls, db: AsyncSession, owner_id: str, room_id: str) -> Dict[str, Any]:
        cfg = await cls.get_config_by_room_id(db, owner_id, room_id)
        if not cfg:
            raise KeyError(f"No configured sensor room '{room_id}' for this user.")
        profile = dict(cfg.calibration_profile or {})
        if not profile.get("room_width_m"):
            profile["room_width_m"] = 6.0
        if not profile.get("room_length_m"):
            profile["room_length_m"] = 4.0
        if "anchors" not in profile:
            profile["anchors"] = [
                {"id": "ap_01", "role": "transmitter", "x_m": 3.0, "y_m": 0.2, "label": "Wi-Fi AP Anchor"},
                {"id": "rx_01", "role": "receiver", "x_m": 3.0, "y_m": 3.8, "label": "CSI Receiver Node"},
            ]
        if "obstacles" not in profile:
            profile["obstacles"] = [
                {"id": "desk_1", "type": "desk", "x_m": 4.0, "y_m": 2.2, "width_m": 1.4, "length_m": 0.9, "label": "Workstation"},
                {"id": "lounge_1", "type": "sofa", "x_m": 1.1, "y_m": 2.5, "width_m": 1.4, "length_m": 1.1, "label": "Lounge Seating"},
                {"id": "door_1", "type": "door", "x_m": 0.8, "y_m": 0.0, "width_m": 0.8, "length_m": 0.1, "label": "Door"},
            ]
        return profile

    @classmethod
    async def save_calibration(
        cls, db: AsyncSession, owner_id: str, room_id: str, profile: Dict[str, Any]
    ) -> Dict[str, Any]:
        cfg = await cls.get_config_by_room_id(db, owner_id, room_id)
        if not cfg:
            raise KeyError(f"No configured sensor room '{room_id}' for this user.")
        now = utc_now()
        cfg.calibration_profile = profile
        cfg.updated_at = now

        audit = WifiSensingAudit(
            owner_id=owner_id,
            room_id=room_id,
            action="calibration_saved",
            details={"anchors_count": len(profile.get("anchors", [])), "obstacles_count": len(profile.get("obstacles", []))},
            created_at=now,
        )
        db.add(audit)
        await db.commit()
        await db.refresh(cfg)
        return profile

    @classmethod
    async def record_baseline(
        cls, db: AsyncSession, owner_id: str, room_id: str, duration_sec: int = 5
    ) -> Dict[str, Any]:
        cfg = await cls.get_config_by_room_id(db, owner_id, room_id)
        if not cfg:
            raise KeyError(f"No configured sensor room '{room_id}' for this user.")

        now = utc_now()
        pipe = cls.get_pipeline(room_id)
        is_hw = not pipe.provider.is_simulated

        # Sample baseline
        sample = await pipe.provider.capture_sample()
        noise_floor = sample.noise_floor_dbm if sample else -92.0
        ambient_var = sample.subcarrier_variance if sample else 0.015
        rssi = sample.rssi_dbm if sample else -55.0

        baseline_data = {
            "noise_floor_dbm": noise_floor,
            "ambient_variance": ambient_var,
            "baseline_rssi_dbm": rssi,
            "calibrated_at": now.isoformat(),
            "sample_duration_seconds": duration_sec,
            "is_hardware_calibrated": is_hw,
            "calibration_status": "calibrated",
            "provider_id": pipe.provider.provider_id,
        }

        current_profile = dict(cfg.calibration_profile or {})
        current_profile["empty_room_baseline"] = baseline_data
        current_profile["is_hardware_calibrated"] = is_hw
        current_profile["calibrated_at"] = now.isoformat()
        cfg.calibration_profile = current_profile
        cfg.updated_at = now

        audit = WifiSensingAudit(
            owner_id=owner_id,
            room_id=room_id,
            action="baseline_calibrated",
            details=baseline_data,
            created_at=now,
        )
        db.add(audit)
        await db.commit()
        await db.refresh(cfg)
        return current_profile

    # --- Simulation Lifecycle ---

    @classmethod
    async def start_simulation(
        cls, db: AsyncSession, owner_id: str, room_id: str, speed: float = 1.0, provider_id: Optional[str] = None
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

        pipe = cls.get_pipeline(room_id, provider_id=provider_id)
        await pipe.provider.start(room_id=room_id, speed=speed)

        # Emit initial observation tick immediately
        event_data: Optional[NormalizedSensorEvent] = await pipe.step()
        is_sim = event_data.is_simulated if event_data else pipe.provider.is_simulated
        if event_data:
            db_event = WifiSensingEvent(
                config_id=cfg.id,
                owner_id=owner_id,
                room_id=room_id,
                timestamp=event_data.timestamp,
                is_simulated=is_sim,
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
            details={
                "simulation_speed": speed,
                "is_simulated": is_sim,
                "provider_id": pipe.provider.provider_id,
            },
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
            is_simulated=event_data.is_simulated,
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
            is_simulated=latest.is_simulated if events else True,
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

    # --- ESP32 DevKit V1 Hardware Controls & Real-Time Ingestion ---

    @classmethod
    def get_esp32_status(cls) -> Esp32HardwareStatusResponse:
        adapter = cls._esp32_csi_adapter
        health = adapter.collector.get_health()
        cal = adapter.engine.calibration
        state = adapter._latest_state

        return Esp32HardwareStatusResponse(
            is_connected=health.is_connected,
            port=health.port,
            baud_rate=health.baud_rate,
            status=health.status,
            status_message=health.status_message,
            packets_captured=health.packets_captured,
            packets_per_second=health.packets_per_second,
            malformed_packets=health.malformed_packets,
            last_packet_time=health.last_packet_time,
            last_error=health.last_error,
            device_description=health.device_description or adapter._detected_device,
            detected_ports=health.detected_ports,
            is_calibrated=cal.is_calibrated,
            baseline_variance=cal.baseline_variance,
            motion_threshold=cal.motion_threshold,
            presence_threshold=cal.presence_threshold,
            current_state=state.presence_state if state else None,
            presence_probability=state.presence_probability if state else None,
            motion_intensity=state.motion_intensity if state else None,
            rssi_dbm=state.rssi_dbm if state else None,
            subcarrier_amplitudes=state.subcarrier_amplitudes[:64] if state else [],
        )

    @classmethod
    async def connect_esp32(cls, port: str = "COM7", baud_rate: int = 921600) -> Esp32HardwareStatusResponse:
        adapter = cls._esp32_csi_adapter
        adapter.serial_port = port
        adapter.baud_rate = baud_rate
        await adapter.start(room_id="esp32_hardware_room")
        await asyncio.sleep(0.3)
        return cls.get_esp32_status()

    @classmethod
    async def disconnect_esp32(cls) -> Esp32HardwareStatusResponse:
        adapter = cls._esp32_csi_adapter
        await adapter.stop()
        return cls.get_esp32_status()

    @classmethod
    def calibrate_esp32(cls, duration_seconds: float = 5.0) -> Esp32HardwareStatusResponse:
        adapter = cls._esp32_csi_adapter
        adapter.start_calibration(duration_seconds=duration_seconds)
        return cls.get_esp32_status()

    @classmethod
    def clear_esp32_calibration(cls) -> Esp32HardwareStatusResponse:
        adapter = cls._esp32_csi_adapter
        adapter.reset_calibration()
        return cls.get_esp32_status()

    @classmethod
    async def stream_esp32_events(cls) -> AsyncGenerator[str, None]:
        adapter = cls._esp32_csi_adapter
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue(maxsize=40)

        def on_packet(pkt: Any) -> None:
            state = adapter._latest_state
            if state:
                data = {
                    "type": "csi_packet",
                    "timestamp": state.timestamp.isoformat(),
                    "presence_state": state.presence_state,
                    "presence_probability": state.presence_probability,
                    "motion_intensity": state.motion_intensity,
                    "motion_level": state.motion_level,
                    "detection_confidence": state.detection_confidence,
                    "rssi_dbm": state.rssi_dbm,
                    "subcarrier_variance": state.subcarrier_variance,
                    "doppler_energy": state.doppler_energy,
                    "subcarrier_count": state.active_subcarrier_count,
                    "subcarrier_amplitudes": state.subcarrier_amplitudes[:64],
                    "packets_captured": adapter.collector._packets_captured,
                    "packet_sequence": pkt.sequence,
                    "mac_address": pkt.mac_address,
                    "calibration_status": state.calibration_status,
                }
                # Thread-safe dispatch to asyncio queue
                loop.call_soon_threadsafe(
                    lambda: queue.put_nowait(data) if not queue.full() else None
                )

        adapter.collector.add_packet_listener(on_packet)
        try:
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=1.0)
                    yield f"event: csi_frame\ndata: {json.dumps(item)}\n\n"
                except asyncio.TimeoutError:
                    st = cls.get_esp32_status()
                    heartbeat = {
                        "type": "heartbeat",
                        "status": st.status,
                        "status_message": st.status_message,
                        "packets_per_second": st.packets_per_second,
                        "packets_captured": st.packets_captured,
                        "current_state": st.current_state,
                        "rssi_dbm": st.rssi_dbm,
                        "subcarrier_amplitudes": st.subcarrier_amplitudes[:64],
                        "calibration_status": "calibrated" if st.is_calibrated else "uncalibrated",
                    }
                    yield f"event: heartbeat\ndata: {json.dumps(heartbeat)}\n\n"
        finally:
            adapter.collector.remove_packet_listener(on_packet)
