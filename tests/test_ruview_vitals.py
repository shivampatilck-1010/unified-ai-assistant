"""
Unit and Integration Tests for RuView Vitals DSP Engine.
Validates BreathingExtractor, HeartRateExtractor, and Motion Gating.
"""

import math
import os
import sys
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "wifi-sensing")))

from ruview_vitals_engine import (
    RuViewBreathingExtractor,
    RuViewHeartRateExtractor,
    RuViewVitalsPipeline,
    VitalStatus,
)


def test_breathing_extractor_sinusoidal_lock():
    """
    Simulates a resting human subject breathing at 15 BPM (0.25 Hz).
    After accumulating 10 seconds of 50 Hz data, extractor must report ~15 BPM with VALID status.
    """
    sample_rate = 50.0
    freq_hz = 0.25  # 15 breaths per minute
    bpm_target = 15.0

    extractor = RuViewBreathingExtractor(n_subcarriers=56, sample_rate=sample_rate, window_secs=20.0)

    estimate = None
    # Feed 15 seconds of synthetic 15 BPM breathing residuals across 56 subcarriers
    total_samples = int(sample_rate * 15.0)

    for i in range(total_samples):
        t = i / sample_rate
        # Sine wave with amplitude 0.5 and subtle noise
        val = 0.5 * math.sin(2.0 * math.pi * freq_hz * t)
        residuals = [val + 0.01 * (k % 5) for k in range(56)]
        est = extractor.extract(residuals, is_moving=False)
        if est is not None:
            estimate = est

    assert estimate is not None
    assert estimate.status in (VitalStatus.VALID, VitalStatus.DEGRADED)
    # Estimated BPM should be close to 15.0 BPM (within +/- 2.0 BPM)
    assert abs(estimate.value_bpm - bpm_target) < 2.0
    assert estimate.confidence >= 0.40


def test_motion_gating_suppression():
    """
    Verifies that when gross physical movement occurs (is_moving=True),
    the extractor immediately suppresses vitals, clears window, and returns UNAVAILABLE.
    """
    sample_rate = 50.0
    extractor = RuViewBreathingExtractor(n_subcarriers=56, sample_rate=sample_rate)

    # First feed clean breathing for 12 seconds
    for i in range(int(sample_rate * 12.0)):
        t = i / sample_rate
        val = 0.5 * math.sin(2.0 * math.pi * 0.25 * t)
        extractor.extract([val] * 56, is_moving=False)

    # Now simulate human walking (is_moving=True)
    gated_est = extractor.extract([5.0] * 56, is_moving=True)
    assert gated_est is not None
    assert gated_est.status == VitalStatus.UNAVAILABLE
    assert gated_est.confidence == 0.0
    assert gated_est.value_bpm == 0.0


def test_out_of_band_rejection():
    """
    A signal oscillating at 1.5 Hz (90 CPM) is outside the 0.1-0.5 Hz breathing band.
    Extractor must reject it and return None.
    """
    sample_rate = 50.0
    freq_hz = 1.5  # 90 CPM (out of breathing band)

    extractor = RuViewBreathingExtractor(n_subcarriers=56, sample_rate=sample_rate)

    for i in range(int(sample_rate * 12.0)):
        t = i / sample_rate
        val = 0.5 * math.sin(2.0 * math.pi * freq_hz * t)
        est = extractor.extract([val] * 56, is_moving=False)

    # None should have been emitted because frequency is out-of-band
    assert extractor._last_estimate is None


def test_heart_rate_extractor_cardiac_band():
    """
    Verifies HeartRateExtractor detects periodicity in 0.8-2.0 Hz band (~72 BPM / 1.2 Hz).
    """
    sample_rate = 50.0
    freq_hz = 1.2  # 72 BPM
    extractor = RuViewHeartRateExtractor(n_subcarriers=56, sample_rate=sample_rate, window_secs=10.0)

    estimate = None
    for i in range(int(sample_rate * 8.0)):
        t = i / sample_rate
        val = 0.1 * math.sin(2.0 * math.pi * freq_hz * t)
        phases = [0.05 * math.sin(2.0 * math.pi * freq_hz * t + k * 0.01) for k in range(56)]
        est = extractor.extract([val] * 56, phases=phases, is_moving=False)
        if est is not None:
            estimate = est

    assert estimate is not None
    assert abs(estimate.value_bpm - 72.0) < 6.0


def test_combined_vitals_pipeline():
    """
    Verifies RuViewVitalsPipeline orchestrates both extractors and handles baseline.
    """
    pipeline = RuViewVitalsPipeline(sample_rate=50.0, n_subcarriers=56)
    pipeline.set_baseline([20.0] * 56)

    reading = None
    for i in range(int(50.0 * 12.0)):
        t = i / 50.0
        # 15 BPM breathing on top of baseline
        amp = 20.0 + 0.4 * math.sin(2.0 * math.pi * 0.25 * t)
        reading = pipeline.process_frame([amp] * 56, is_moving=False)

    assert reading is not None
    assert reading.respiratory_rate is not None
    assert reading.respiratory_rate.status in (VitalStatus.VALID, VitalStatus.DEGRADED)
    assert abs(reading.respiratory_rate.value_bpm - 15.0) < 2.5
