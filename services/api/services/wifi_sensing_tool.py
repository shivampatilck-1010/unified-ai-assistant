from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from services.wifi_sensing_service import WifiSensingService


class WifiSensingTool:
    """Typed tool capability for assistant orchestration to inspect Wi-Fi sensing and occupancy trends.

    Strict Safety & Privacy Guardrails:
    - Explicitly identifies all observations as synthetic.
    - Refuses to infer individual human identities or biometric features.
    - Does not treat missing sensor data as proof of room vacancy.
    - Requires authorized room configurations before summarizing events.
    """

    @classmethod
    def get_tool_declaration(cls) -> Dict[str, Any]:
        return {
            "name": "wifi_sensing",
            "description": (
                "Query Wi-Fi sensing subsystem capabilities, simulation status, and room occupancy summaries. "
                "All data in this phase is synthetic and operates in simulation mode. Cannot identify individuals."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["check_availability", "get_status", "summarize_room", "explain_simulation"],
                        "description": "The sensing inspection action to perform.",
                    },
                    "room_id": {
                        "type": "string",
                        "description": "Target authorized room identifier (e.g. 'office_a').",
                    },
                },
                "required": ["action"],
            },
        }

    @classmethod
    async def execute(
        cls,
        db: AsyncSession,
        owner_id: str,
        action: str,
        room_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Executes a sensing tool action within strict tenant and privacy boundaries."""
        if action == "check_availability":
            caps = WifiSensingService.get_capabilities()
            real_rssi_caps = next((p for p in caps.providers if p.provider_id == "real_wifi_rssi_hardware"), None)
            rssi_available = real_rssi_caps.is_available if real_rssi_caps else False
            return {
                "simulation_available": True,
                "hardware_available": False,
                "real_rssi_available": rssi_available,
                "real_rssi_adapter": real_rssi_caps.name if real_rssi_caps else None,
                "hardware_status": (
                    f"Physical Wi-Fi RSSI adapter detected: {real_rssi_caps.name}. "
                    "Real RSSI measurements are supported; raw CSI frame capture requires specialized firmware."
                    if rssi_available
                    else "No compatible physical CSI Wi-Fi network interface card detected on host operating system."
                ),
                "active_provider": caps.active_provider_id,
                "is_simulated": True,
                "disclaimer": (
                    "NOTICE: Physical Wi-Fi sensing hardware is not detected (raw CSI). "
                    "The system is operating in synthetic simulation mode by default. "
                    "Observations are algorithmic proxies and do not represent real physical humans."
                ),
            }

        elif action == "get_status":
            status = await WifiSensingService.get_status(db, owner_id=owner_id)
            configs = await WifiSensingService.list_configs(db, owner_id=owner_id)
            return {
                "service_status": status.status,
                "simulation_mode": True,
                "hardware_detected": False,
                "active_simulations_count": status.active_simulations_count,
                "active_rooms": status.active_rooms,
                "configured_rooms": [
                    {
                        "room_id": c.room_id,
                        "room_name": c.room_name,
                        "is_authorized": c.is_authorized,
                        "is_active": c.is_active,
                        "simulation_speed": c.simulation_speed,
                        "retention_days": c.retention_days,
                    }
                    for c in configs
                ],
                "is_simulated": True,
            }

        elif action == "summarize_room":
            if not room_id:
                return {
                    "error": "room_id is required to summarize room occupancy.",
                    "is_simulated": True,
                }
            try:
                summary = await WifiSensingService.get_occupancy_summary(db, owner_id=owner_id, room_id=room_id)
                cfg = await WifiSensingService.get_config_by_room_id(db, owner_id=owner_id, room_id=room_id)
                return {
                    "room_id": room_id,
                    "room_name": cfg.room_name if cfg else room_id,
                    "is_simulated": summary.is_simulated,
                    "simulation_notice": (
                        "ALL MEASUREMENTS ARE SYNTHETIC CSI SIMULATIONS. DO NOT USE FOR REAL SAFETY OR IDENTIFICATION."
                        if summary.is_simulated
                        else "REAL PHYSICAL WI-FI RSSI MEASUREMENTS. DO NOT USE FOR CRITICAL LIFE SAFETY OR PERSONAL IDENTIFICATION."
                    ),
                    "total_samples": summary.total_events,
                    "current_state": summary.current_state,
                    "current_probability": summary.current_probability,
                    "average_signal_dbm": summary.average_signal_dbm,
                    "state_breakdown": summary.state_breakdown,
                    "last_observation_time": (
                        summary.last_event_time.isoformat() if summary.last_event_time else None
                    ),
                    "privacy_notice": (
                        "No individual person identity is captured or inferred. "
                        "State indicates RF disturbance tier ('vacant', 'presence', 'motion') only."
                    ),
                }
            except KeyError:
                return {
                    "error": f"Room '{room_id}' not found or not configured for this account.",
                    "is_simulated": True,
                }

        elif action == "explain_simulation":
            return {
                "simulation_mode": True,
                "explanation": (
                    "Wi-Fi Sensing in this assistant uses deterministic mathematical modeling of Channel State "
                    "Information (CSI) amplitude perturbation, Doppler frequency shifts, and multi-path RF fading. "
                    "In this Phase 7 deployment, no physical RF antennas are recording packets; all data is synthetic. "
                    "Presence estimations are statistical likelihoods derived from synthetic disturbance baselines."
                ),
                "hardware_compatibility": (
                    "Future physical hardware integration requires compatible Intel 5300, Atheros 9k, or ESP32-CSI "
                    "firmware with explicit physical owner consent. Real hardware is currently uninstalled."
                ),
            }

        else:
            return {
                "error": f"Unknown sensing tool action: '{action}'.",
                "valid_actions": ["check_availability", "get_status", "summarize_room", "explain_simulation"],
            }
