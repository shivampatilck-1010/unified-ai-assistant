# Wi-Fi Sensing Subsystem (`services/wifi-sensing`)

## Purpose
The Wi-Fi Sensing Subsystem provides non-identifying environmental presence and motion estimation based on Channel State Information (CSI) disturbance dynamics.

## Phase 7 Implementation Status
In Phase 7, the subsystem is fully implemented and operating in **Simulation Mode** using deterministic mathematical modeling:
- **Synthetic Sensing Simulator (`synthetic_simulator.py`)**: Produces clearly labeled synthetic observations (`is_simulated = True`, `sensor_type = "synthetic_csi"`) modeling ambient noise floors, stationary breathing perturbations (~0.25 Hz sinusoidal shifts), and dynamic multi-path motion bursts.
- **Hardware Adapter Boundary (`hardware_adapter.py`)**: Defines the strict boundary for physical CSI hardware. When compatible capture NICs or kernel drivers (e.g. Intel 5300, Atheros 9k, ESP32-CSI) are absent, it honestly declares `is_available: False` with descriptive diagnostic reasons rather than fabricating hardware detection.
- **Statistical Presence Estimator (`presence_estimator.py`)**: A baseline statistical estimator classifying RF energy into `vacant`, `presence`, and `motion` regimes. When telemetry is degraded or missing, it returns an explicit `unknown` state.
- **Processing Pipeline (`event_pipeline.py`)**: Bounded FIFO event pipeline coordinating sensor acquisition, validation, normalization, and inference.
- **Persistence & API (`services/api/services/wifi_sensing_service.py` & `routers/wifi_sensing.py`)**: Tenant-isolated room configurations, Alembic-backed time-series storage (`wifi_sensing_events`), configurable retention policies, manual purges, and immutable consent audit logs (`wifi_sensing_audits`).
- **Assistant Integration (`services/api/services/wifi_sensing_tool.py`)**: Exposes a typed tool capability allowing the AI assistant to summarize authorized telemetry while enforcing strict privacy rules: no real-human presence claims from synthetic data, no individual identification, and no treating missing data as vacancy.

## Privacy & Safety Controls
1. **Explicit Operator Consent**: Every room must have `is_authorized: True` before simulation or monitoring can be activated.
2. **Transparent Simulation Badging**: Every event, schema, and UI screen explicitly labels synthetic telemetry with `SIMULATION MODE ACTIVE`.
3. **No Personal Identifiers**: The system captures only aggregated RF disturbance metrics; no MAC addresses, packets, biometric signatures, or individual identities are collected.
4. **Data Retention & Purging**: Event history is automatically bounded by configurable retention windows (default 7 days) and supports one-click user purges.
5. **No Default External Transmission**: Raw RF telemetry is never sent to external AI providers.
