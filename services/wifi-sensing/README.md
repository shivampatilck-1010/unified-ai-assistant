# Wi-Fi Sensing Service (services/wifi-sensing)

## Purpose
An isolated microservice responsible for Wi-Fi Channel State Information (CSI) sensing, presence detection, and environmental activity awareness.

## Planned Architecture (Future Phases)
- Simulation engine generating realistic CSI amplitude and phase perturbations.
- Signal processing pipeline (subcarrier filtering, Doppler shift calculation, PCA).
- Local presence/absence classification and breathing rate detection models.
- Event pub/sub to notify the primary assistant when room occupancy changes.

## Status in Phase 0
- Scaffolding initialized.
- Service isolation boundaries defined.
