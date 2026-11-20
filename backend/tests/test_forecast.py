"""Crowd forecast: real-time horizons, robust to single bad counts, honest when data is short."""
import pytest

from forecast import forecast_feed

NOW = 10_000.0


def series(counts, every_s=10):
    """Counts ending at NOW, one every `every_s` seconds."""
    start = NOW - every_s * (len(counts) - 1)
    return [(start + i * every_s, c) for i, c in enumerate(counts)]


def run(points, capacity=100, **kw):
    kw.setdefault("min_points", 4)
    kw.setdefault("min_span_s", 60)  # the shape tests below use 1-2 minutes of data
    return forecast_feed(points, capacity=capacity, critical_pct=90, warning_pct=70, now=NOW, **kw)


def test_needs_enough_history():
    assert run(series([10, 12, 14])) is None                 # 3 points
    assert run(series([10, 12, 14, 16], every_s=5)) is None  # 4 points over 15 s
    assert run(series([10, 12, 14, 16, 18, 20, 22])) is not None


def test_default_needs_three_minutes():
    def default(points):
        return forecast_feed(points, capacity=100, critical_pct=90, warning_pct=70, now=NOW)

    assert default(series([10] * 7, every_s=20)) is None       # 2 minutes
    assert default(series([10] * 5, every_s=60)) is None       # 4 minutes, 5 counts
    assert default(series([10] * 7, every_s=30)) is not None   # 3 minutes, 7 counts


def test_horizon_is_real_minutes():
    # +2 people every 10 s = +12 per minute -> +180 in 15 min
    f = run(series([20 + 2 * i for i in range(13)]), capacity=1000)
    assert f.trend_per_min == pytest.approx(12)
    assert f.current == 44
    assert f.predicted["15_min"] == 44 + 180
    assert f.predicted["30_min"] == 44 + 360


def test_one_bad_frame_does_not_swing_the_forecast():
    steady = [50] * 12
    spike = steady[:-1] + [400]  # one wildly wrong count, as the newest point
    f = run(series(spike))
    assert f.current == 50
    assert f.trend_per_min == 0
    assert f.predicted["15_min"] == 50
    assert f.risk_level == "low"


def test_old_points_outside_window_are_ignored():
    old = [(NOW - 3600 + i, 500) for i in range(10)]   # an hour ago, very busy
    f = run(old + series([30] * 8))
    assert f.samples == 8
    assert f.predicted["15_min"] == 30


def test_rising_crowd_is_high_risk_before_it_is_critical():
    # 40 people now in a 100-capacity zone, +3 per minute -> 85 in 15 min (warning), 90 at 16.7 min
    f = run(series([40 - 3 * (6 - i) / 6 for i in range(7)]))  # 7 points over 60 s
    assert f.risk_level == "medium"
    assert f.minutes_to_critical == pytest.approx(16.7, abs=0.2)

    f = run(series([60 + i for i in range(13)]))  # +6/min from 72 -> 162 in 15 min
    assert f.risk_level == "high"
    assert "expected in 15 min" in f.reason


def test_already_critical_and_never_negative():
    f = run(series([95] * 8))
    assert f.risk_level == "high" and f.minutes_to_critical == 0
    f = run(series([60 - 5 * i for i in range(12)]))  # emptying fast
    assert f.predicted["30_min"] == 0
    assert f.minutes_to_critical is None
