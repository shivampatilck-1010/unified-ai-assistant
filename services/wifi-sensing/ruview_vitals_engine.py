"""
RuView-Compatible Vital Signs DSP Engine.
Repository: Unified AI Assistant (services/wifi-sensing)

Direct algorithmic translation of RuView's wifi-densepose-vitals crate:
- ADR-117 / ADR-157 / ADR-158 compliant
- BreathingExtractor: 2nd-order resonator IIR bandpass (0.1–0.5 Hz / 6–30 BPM)
- Zero-crossing frequency extraction + normalized autocorrelation confidence
- HeartRateExtractor: Cascaded 2-stage resonator bandpass (0.8–2.0 Hz / 48–120 BPM)
- Motion Gating: Suppresses vitals during bulk human movement to prevent false harmonics
- Truthful reporting: Returns VitalStatus.Unavailable when movement dominates
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from enum import Enum
import math
import statistics
import time
from typing import Deque, List, Optional, Sequence, Tuple


class VitalStatus(str, Enum):
    """Clinical status of vital sign extraction matching RuView ADR-117."""
    VALID = "valid"              # High confidence (>= 0.7), stable periodic signal
    DEGRADED = "degraded"        # Moderate confidence (0.4 - 0.7), reduced SNR
    UNRELIABLE = "unreliable"    # Low confidence (< 0.4), noise dominant
    UNAVAILABLE = "unavailable"  # Subject moving or insufficient data window


@dataclass(frozen=True)
class VitalEstimate:
    """Single vital-sign estimate matching RuView PyVitalEstimate."""
    value_bpm: float
    confidence: float
    status: VitalStatus


@dataclass(frozen=True)
class VitalReading:
    """Combined snapshot of respiration and cardiac metrics."""
    respiratory_rate: Optional[VitalEstimate]
    heart_rate: Optional[VitalEstimate]
    subcarrier_count: int
    signal_quality: float
    timestamp_secs: float
    is_motion_gated: bool = False


@dataclass
class _IirResonatorState:
    """2nd-order IIR bandpass resonator filter state."""
    x1: float = 0.0
    x2: float = 0.0
    y1: float = 0.0
    y2: float = 0.0

    def reset(self) -> None:
        self.x1 = 0.0
        self.x2 = 0.0
        self.y1 = 0.0
        self.y2 = 0.0


class RuViewBreathingExtractor:
    """
    Extracts respiratory rate (6–30 BPM) from per-subcarrier amplitude residuals
    using RuView's exact 2nd-order IIR resonator bandpass filter and zero-crossing analysis.
    """

    def __init__(
        self,
        n_subcarriers: int = 56,
        sample_rate: float = 50.0,
        window_secs: float = 30.0,
        freq_low: float = 0.1,
        freq_high: float = 0.5,
    ) -> None:
        self.n_subcarriers = n_subcarriers
        self.sample_rate = sample_rate
        self.window_secs = window_secs
        self.freq_low = freq_low
        self.freq_high = freq_high

        self._filter_state = _IirResonatorState()
        self._history: Deque[float] = deque(maxlen=int(sample_rate * window_secs))
        self._consecutive_rejections = 0
        self._last_estimate: Optional[VitalEstimate] = None

    def reset(self) -> None:
        """Resets filter memory and history window."""
        self._filter_state.reset()
        self._history.clear()
        self._consecutive_rejections = 0
        self._last_estimate = None

    def extract(
        self,
        residuals: Sequence[float],
        weights: Optional[Sequence[float]] = None,
        is_moving: bool = False,
    ) -> Optional[VitalEstimate]:
        """
        Processes one CSI frame's amplitude residuals and returns a VitalEstimate.
        If is_moving is True, returns VitalStatus.UNAVAILABLE via motion gating.
        """
        # Motion Gating: Gross physical displacement (10-100cm) corrupts breathing (1-5mm)
        if is_moving:
            self.reset()
            return VitalEstimate(
                value_bpm=0.0,
                confidence=0.0,
                status=VitalStatus.UNAVAILABLE,
            )

        n = min(len(residuals), self.n_subcarriers)
        if n == 0:
            return None

        # 1. Weighted subcarrier fusion
        weighted_signal = self._fuse_residuals(residuals[:n], weights)

        # 2. 2nd-order resonator bandpass filter
        filtered = self._apply_bandpass(weighted_signal)
        if not math.isfinite(filtered):
            return None

        # 3. Sliding window buffer
        self._history.append(filtered)

        # Need at least 8 seconds of continuous quiet data
        min_samples = int(self.sample_rate * 8.0)
        if len(self._history) < min_samples:
            return None

        # 4. Zero-crossing analysis
        history_list = list(self._history)
        crossings = self._count_zero_crossings(history_list)
        duration_s = len(history_list) / self.sample_rate
        frequency_hz = crossings / (2.0 * duration_s)

        # 5. Out-of-band rejection & reset logic (RuView issue #1422 parity)
        if frequency_hz < self.freq_low or frequency_hz > self.freq_high:
            self._consecutive_rejections += 1
            if self._consecutive_rejections >= 2:
                self.reset()
            return None

        self._consecutive_rejections = 0
        bpm = frequency_hz * 60.0

        # 6. Normalized autocorrelation confidence
        confidence = self._compute_autocorrelation_confidence(history_list, frequency_hz)

        # 7. Status classification
        if confidence >= 0.70:
            status = VitalStatus.VALID
        elif confidence >= 0.40:
            status = VitalStatus.DEGRADED
        else:
            status = VitalStatus.UNRELIABLE

        est = VitalEstimate(
            value_bpm=round(bpm, 1),
            confidence=round(confidence, 3),
            status=status,
        )
        self._last_estimate = est
        return est

    def _fuse_residuals(
        self,
        residuals: Sequence[float],
        weights: Optional[Sequence[float]],
    ) -> float:
        """Weighted fusion across active subcarriers."""
        n = len(residuals)
        if not weights or len(weights) < n:
            # Uniform weighting
            return sum(residuals) / n

        weight_total = sum(weights[:n])
        if abs(weight_total) < 1e-12:
            return sum(residuals) / n

        weighted_sum = sum(r * w for r, w in zip(residuals[:n], weights[:n]))
        return weighted_sum / weight_total

    def _apply_bandpass(self, input_val: float) -> float:
        """
        2nd-order resonator IIR bandpass filter.
        Matches RuView breathing.rs:
        y[n] = (1-r)*(x[n] - x[n-2]) + 2*r*cos(w0)*y[n-1] - r^2*y[n-2]
        """
        state = self._filter_state
        omega_low = 2.0 * math.pi * self.freq_low / self.sample_rate
        omega_high = 2.0 * math.pi * self.freq_high / self.sample_rate
        bw = omega_high - omega_low
        center = 0.5 * (omega_low + omega_high)

        r = max(0.0, min(0.9999, 1.0 - bw / 2.0))
        cos_w0 = math.cos(center)

        output = (1.0 - r) * (input_val - state.x2) + 2.0 * r * cos_w0 * state.y1 - (r * r) * state.y2

        if not math.isfinite(output):
            state.reset()
            return 0.0

        state.x2 = state.x1
        state.x1 = input_val
        state.y2 = state.y1
        state.y1 = output
        return output

    @staticmethod
    def _count_zero_crossings(signal: List[float]) -> int:
        count = 0
        for i in range(len(signal) - 1):
            if signal[i] * signal[i + 1] < 0.0:
                count += 1
        return count

    def _compute_autocorrelation_confidence(
        self,
        history: List[float],
        frequency_hz: float,
    ) -> float:
        """Measures cycle-to-cycle repeatability via normalized covariance."""
        if len(history) < 4 or frequency_hz <= 0.0 or self.sample_rate <= 0.0:
            return 0.0

        period_samples = int(round(self.sample_rate / frequency_hz))
        if period_samples <= 0 or period_samples >= len(history) - 1:
            return 0.0

        overlap = len(history) - period_samples
        earlier = history[:overlap]
        later = history[period_samples:]

        mean_earlier = sum(earlier) / overlap
        mean_later = sum(later) / overlap

        covariance = 0.0
        energy_earlier = 0.0
        energy_later = 0.0

        for x, y in zip(earlier, later):
            dx = x - mean_earlier
            dy = y - mean_later
            covariance += dx * dy
            energy_earlier += dx * dx
            energy_later += dy * dy

        denom = math.sqrt(energy_earlier * energy_later)
        if denom < 1e-12:
            return 0.0

        regularity = max(0.0, min(1.0, covariance / denom))
        observed_cycles = len(history) / period_samples
        cycle_coverage = max(0.0, min(1.0, observed_cycles - 1.0))
        return max(0.0, min(1.0, regularity * cycle_coverage))


class RuViewHeartRateExtractor:
    """
    Extracts cardiac pulse (48–120 BPM) from inter-subcarrier phase coherence
    using RuView's cascaded 2-stage resonator filter (0.8–2.0 Hz).
    Single-node ESP32 cardiac metrics are strictly flagged as UNRELIABLE/DEGRADED.
    """

    def __init__(
        self,
        n_subcarriers: int = 56,
        sample_rate: float = 50.0,
        window_secs: float = 15.0,
        freq_low: float = 0.8,
        freq_high: float = 2.0,
    ) -> None:
        self.n_subcarriers = n_subcarriers
        self.sample_rate = sample_rate
        self.window_secs = window_secs
        self.freq_low = freq_low
        self.freq_high = freq_high

        self._stage1 = _IirResonatorState()
        self._stage2 = _IirResonatorState()
        self._history: Deque[float] = deque(maxlen=int(sample_rate * window_secs))

    def reset(self) -> None:
        self._stage1.reset()
        self._stage2.reset()
        self._history.clear()

    def extract(
        self,
        residuals: Sequence[float],
        phases: Optional[Sequence[float]] = None,
        is_moving: bool = False,
    ) -> Optional[VitalEstimate]:
        if is_moving:
            self.reset()
            return VitalEstimate(
                value_bpm=0.0,
                confidence=0.0,
                status=VitalStatus.UNAVAILABLE,
            )

        n = min(len(residuals), self.n_subcarriers)
        if n < 8:
            return None

        # Compute phase coherence signal
        if phases and len(phases) >= n:
            phase_diffs = [abs(phases[i] - phases[i - 1]) for i in range(1, n)]
            coherence = 1.0 / (1.0 + statistics.mean(phase_diffs))
            raw_signal = (sum(residuals[:n]) / n) * coherence
        else:
            raw_signal = sum(residuals[:n]) / n

        # Stage 1 filter
        s1 = self._apply_stage(raw_signal, self._stage1)
        # Stage 2 filter (cascaded resonator suppresses respiratory harmonics)
        s2 = self._apply_stage(s1, self._stage2)

        if not math.isfinite(s2):
            return None

        self._history.append(s2)

        min_samples = int(self.sample_rate * 6.0)
        if len(self._history) < min_samples:
            return None

        # Autocorrelation peak finding
        history_list = list(self._history)
        min_lag = int(self.sample_rate / self.freq_high)  # 120 BPM -> 0.5s
        max_lag = int(self.sample_rate / self.freq_low)   # 48 BPM -> 1.25s

        best_lag = -1
        best_corr = -1.0

        for lag in range(min_lag, min(max_lag, len(history_list) // 2)):
            corr = self._calc_autocorr_at_lag(history_list, lag)
            if corr > best_corr:
                best_corr = corr
                best_lag = lag

        if best_lag <= 0 or best_corr < 0.25:
            return None

        period_s = best_lag / self.sample_rate
        freq_hz = 1.0 / period_s
        bpm = freq_hz * 60.0

        if bpm < 40.0 or bpm > 140.0:
            return None

        # Confidence capped to 0.5 on single-node ESP32 (honest reporting)
        capped_conf = round(min(0.5, best_corr * 0.6), 3)

        return VitalEstimate(
            value_bpm=round(bpm, 1),
            confidence=capped_conf,
            status=VitalStatus.DEGRADED if capped_conf >= 0.35 else VitalStatus.UNRELIABLE,
        )

    def _apply_stage(self, input_val: float, state: _IirResonatorState) -> float:
        omega_low = 2.0 * math.pi * self.freq_low / self.sample_rate
        omega_high = 2.0 * math.pi * self.freq_high / self.sample_rate
        bw = omega_high - omega_low
        center = 0.5 * (omega_low + omega_high)

        r = max(0.0, min(0.9999, 1.0 - bw / 2.0))
        cos_w0 = math.cos(center)

        output = (1.0 - r) * (input_val - state.x2) + 2.0 * r * cos_w0 * state.y1 - (r * r) * state.y2

        if not math.isfinite(output):
            state.reset()
            return 0.0

        state.x2 = state.x1
        state.x1 = input_val
        state.y2 = state.y1
        state.y1 = output
        return output

    @staticmethod
    def _calc_autocorr_at_lag(signal: List[float], lag: int) -> float:
        n = len(signal) - lag
        if n <= 0:
            return 0.0
        earlier = signal[:n]
        later = signal[lag:]
        denom = math.sqrt(sum(x * x for x in earlier) * sum(y * y for y in later))
        if denom < 1e-12:
            return 0.0
        return sum(x * y for x, y in zip(earlier, later)) / denom


class RuViewVitalsPipeline:
    """
    Combined vitals pipeline taking raw CSI frames and motion state,
    orchestrating BreathingExtractor and HeartRateExtractor.
    """

    def __init__(self, sample_rate: float = 50.0, n_subcarriers: int = 56) -> None:
        self.sample_rate = sample_rate
        self.n_subcarriers = n_subcarriers
        self.breathing = RuViewBreathingExtractor(n_subcarriers=n_subcarriers, sample_rate=sample_rate)
        self.heart_rate = RuViewHeartRateExtractor(n_subcarriers=n_subcarriers, sample_rate=sample_rate)
        self._baseline_amplitudes: Optional[List[float]] = None

    def set_baseline(self, baseline_amplitudes: List[float]) -> None:
        self._baseline_amplitudes = list(baseline_amplitudes)

    def process_frame(
        self,
        amplitudes: Sequence[float],
        phases: Optional[Sequence[float]] = None,
        is_moving: bool = False,
    ) -> VitalReading:
        """
        Extracts combined VitalReading from CSI amplitudes and phases.
        """
        now_ts = time.time()
        n = min(len(amplitudes), self.n_subcarriers)

        # Compute amplitude residuals
        if self._baseline_amplitudes and len(self._baseline_amplitudes) >= n:
            residuals = [a - b for a, b in zip(amplitudes[:n], self._baseline_amplitudes[:n])]
        else:
            mean_a = sum(amplitudes[:n]) / n if n else 0.0
            residuals = [a - mean_a for a in amplitudes[:n]]

        # Breathing estimation
        br_est = self.breathing.extract(residuals, is_moving=is_moving)

        # Heart rate estimation
        hr_est = self.heart_rate.extract(residuals, phases, is_moving=is_moving)

        # Signal quality
        quality = 0.0
        if br_est and br_est.status != VitalStatus.UNAVAILABLE:
            quality = br_est.confidence
        elif is_moving:
            quality = 0.2  # Movement clutter

        return VitalReading(
            respiratory_rate=br_est,
            heart_rate=hr_est,
            subcarrier_count=n,
            signal_quality=round(quality, 3),
            timestamp_secs=now_ts,
            is_motion_gated=is_moving,
        )
