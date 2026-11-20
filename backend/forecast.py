"""Short-term crowd forecast for one camera feed. Pure functions, no I/O.

The old forecast took the mean step between the last 10 counts and multiplied it by 3 and 6,
calling the result "15 min" and "30 min". Counts arrive every few seconds, so that looked about
a minute ahead, and one jump between two frames could swing it by hundreds of people.

This one works in real time:
  * level  = median of the last 3 counts, each moved along the trend to the newest time
             (one bad frame does not move it)
  * trend  = Theil-Sen slope in people per minute over the last `window_min` minutes
             (median of all pairwise slopes, so outliers and scene cuts barely move it)
  * forecast(h) = level + trend * h minutes, never below 0
It returns None until it has at least `min_points` counts spanning `min_span_s` seconds (by default
6 counts over 3 minutes): projecting 15 minutes ahead from a minute of data mostly amplifies noise.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

HORIZONS_MIN = (15, 30)


@dataclass
class Forecast:
    current: int                    # smoothed count now (see `level` above)
    trend_per_min: float            # people per minute, + growing / - emptying
    predicted: dict                 # {"15_min": int, "30_min": int}
    predicted_pct: float            # 15-minute forecast as % of capacity
    minutes_to_critical: float | None  # when the trend reaches the critical level, if within 30 min
    risk_level: str                 # "high" | "medium" | "low"
    reason: str
    samples: int
    window_minutes: float


def theil_sen_slope(t: np.ndarray, y: np.ndarray) -> float:
    """Median of slopes between every pair of points with different times."""
    i, j = np.triu_indices(len(t), k=1)
    dt = t[j] - t[i]
    keep = dt > 0
    if not keep.any():
        return 0.0
    return float(np.median((y[j] - y[i])[keep] / dt[keep]))


def forecast_feed(points, capacity: int, critical_pct: float, warning_pct: float, now: float,
                  window_min: float = 5.0, min_points: int = 6, min_span_s: float = 180.0) -> Forecast | None:
    """`points`: iterable of (epoch_seconds, count), oldest first."""
    recent = [(t, c) for t, c in points if now - t <= window_min * 60]
    if len(recent) < min_points or recent[-1][0] - recent[0][0] < min_span_s:
        return None

    t = np.array([p[0] for p in recent], float)
    y = np.array([p[1] for p in recent], float)
    slope_s = theil_sen_slope(t, y)
    slope = slope_s * 60.0                         # people per minute
    # Last 3 counts moved along the trend to the newest time, then the median: no lag on a
    # steady rise, and one bad frame still cannot move it.
    level = float(np.median(y[-3:] + slope_s * (t[-1] - t[-3:])))

    predicted = {f"{h}_min": max(0, int(round(level + slope * h))) for h in HORIZONS_MIN}
    pct = lambda n: n / capacity * 100 if capacity > 0 else 0.0
    now_pct, p15_pct = pct(level), pct(predicted["15_min"])

    critical_count = capacity * critical_pct / 100
    minutes_to_critical = None
    if level >= critical_count:
        minutes_to_critical = 0.0
    elif slope > 0:
        m = (critical_count - level) / slope
        if m <= HORIZONS_MIN[-1]:
            minutes_to_critical = round(m, 1)

    trend = f"{slope:+.1f} people/min"
    if now_pct >= critical_pct:
        risk, reason = "high", f"Already at {now_pct:.0f}% of capacity ({trend})."
    elif p15_pct >= critical_pct:
        risk, reason = "high", f"{now_pct:.0f}% now, {p15_pct:.0f}% expected in 15 min ({trend})."
    elif now_pct >= warning_pct or p15_pct >= warning_pct:
        risk, reason = "medium", f"{now_pct:.0f}% now, {p15_pct:.0f}% expected in 15 min ({trend})."
    else:
        risk, reason = "low", f"{now_pct:.0f}% now, {p15_pct:.0f}% expected in 15 min ({trend})."

    return Forecast(
        current=int(round(level)),
        trend_per_min=round(slope, 2),
        predicted=predicted,
        predicted_pct=round(p15_pct, 1),
        minutes_to_critical=minutes_to_critical,
        risk_level=risk,
        reason=reason,
        samples=len(recent),
        window_minutes=round(float(t[-1] - t[0]) / 60, 1),
    )
