"""
MYRMEX v2 Pricing API
─────────────────────
Six parametric insurance categories with actuarially calibrated risk models.
All premiums expressed as % of payout amount.

Categories:
  earthquake       — USGS magnitude threshold
  flood            — USGS river gauge height threshold
  crop_multifactor — composite score < threshold
  hurricane        — sustained wind knots > threshold
  stablecoin_depeg — USDC/USDT price < threshold (bps)
  bridge_hack      — bridge TVL drop > threshold %
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal, Optional
import math

app = FastAPI(title="MYRMEX Pricing API v2", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ── Risk Tables ───────────────────────────────────────────────────────────

# Annual probability of exceedance by magnitude threshold & region
EARTHQUAKE_RISK = {
    # (annual_prob, volatility) by min magnitude
    5.0: (0.95, 0.05),   # M5.0+ happens almost every week globally
    5.5: (0.85, 0.08),
    6.0: (0.70, 0.12),
    6.5: (0.40, 0.15),
    7.0: (0.18, 0.18),
    7.5: (0.07, 0.20),
    8.0: (0.02, 0.22),
}

REGION_SEISMIC_MULTIPLIER = {
    "Pacific Ring":     1.4,
    "Japan":            1.6,
    "Indonesia":        1.5,
    "California":       1.2,
    "Turkey":           1.3,
    "Italy":            1.1,
    "Chile":            1.4,
    "Global":           1.0,
    "DEFAULT":          1.0,
}

# Flood — annual probability by river system
FLOOD_RIVER_RISK = {
    "Mississippi":  (0.08, 0.25),   # Major flood every ~12 years
    "Missouri":     (0.10, 0.28),
    "Ohio":         (0.12, 0.30),
    "Colorado":     (0.05, 0.20),
    "Sacramento":   (0.07, 0.22),
    "Global":       (0.06, 0.25),
    "DEFAULT":      (0.06, 0.25),
}

# Crop — annual probability composite score drops below threshold
CROP_REGION_RISK = {
    "Iowa":           (0.15, 0.20),   # Moderate Midwest drought risk
    "Kansas":         (0.22, 0.25),
    "California":     (0.28, 0.30),
    "Texas":          (0.25, 0.28),
    "Maharashtra":    (0.35, 0.35),   # High drought zone
    "Punjab":         (0.12, 0.18),
    "Global":         (0.20, 0.25),
    "DEFAULT":        (0.20, 0.25),
}

# Hurricane — annual probability of named storm exceeding wind threshold
HURRICANE_RISK_BY_KNOTS = {
    34:  (0.50, 0.15),   # Tropical storm force
    50:  (0.30, 0.18),
    64:  (0.18, 0.20),   # Hurricane force (Category 1)
    83:  (0.10, 0.22),   # Category 2+
    96:  (0.05, 0.24),   # Category 3+
    113: (0.02, 0.26),   # Category 4+
    137: (0.005, 0.28),  # Category 5
}

# Stablecoin depeg — annual probability by peg threshold
DEPEG_RISK = {
    9900: (0.05,  0.10),   # < $0.99 — minor depeg
    9800: (0.015, 0.15),   # < $0.98
    9700: (0.005, 0.20),   # < $0.97 — meaningful depeg
    9500: (0.001, 0.25),   # < $0.95 — severe depeg
    9000: (0.0002, 0.30),  # < $0.90 — catastrophic
}

# Bridge hack — annual probability of TVL drop > threshold %
BRIDGE_HACK_RISK = {
    10: (0.25, 0.30),   # > 10% drop (common in bear markets)
    20: (0.15, 0.32),
    30: (0.08, 0.35),   # > 30% — likely an exploit
    50: (0.04, 0.38),
    70: (0.015, 0.40),  # > 70% — near-total loss
}


def _interpolate(table: dict, key: float) -> tuple:
    """Return (prob, vol) from a sorted risk table, interpolating between keys."""
    keys = sorted(table.keys())
    if key <= keys[0]:
        return table[keys[0]]
    if key >= keys[-1]:
        return table[keys[-1]]
    for i in range(len(keys) - 1):
        lo, hi = keys[i], keys[i + 1]
        if lo <= key <= hi:
            t = (key - lo) / (hi - lo)
            p_lo, v_lo = table[lo]
            p_hi, v_hi = table[hi]
            return (p_lo * (1 - t) + p_hi * t, v_lo * (1 - t) + v_hi * t)
    return table[keys[-1]]


def _premium(
    annual_prob: float,
    volatility: float,
    payout: float,
    duration_days: int,
    utilization: float,
    min_rate: float = 0.005,
) -> dict:
    """
    Expected-value pricing with:
      - Duration scaling (1 - (1-p)^(d/365))
      - Volatility loading (uncertainty premium)
      - Utilization loading (pool capacity risk)
    """
    period_prob = 1 - (1 - annual_prob) ** (duration_days / 365)
    expected_loss = period_prob * payout

    # Volatility loading: more uncertain = higher premium
    vol_load = 1.0 + volatility

    # Utilization loading: congested pool = scarcer capital
    util_load = 1.0 + (utilization ** 2) * 0.5

    premium = max(payout * min_rate, round(expected_loss * vol_load * util_load, 2))
    premium_pct = premium / payout * 100

    return {
        "premium_usdc": premium,
        "risk_score": round(period_prob * 100, 2),
        "confidence": "high" if annual_prob > 0.001 else "medium",
        "breakdown": {
            "annual_probability": round(annual_prob, 5),
            "period_probability": round(period_prob, 5),
            "expected_loss_usdc": round(expected_loss, 2),
            "vol_loading": round(vol_load, 3),
            "util_loading": round(util_load, 3),
            "duration_days": duration_days,
            "premium_pct": round(premium_pct, 3),
        },
    }


# ── Request / Response Models ─────────────────────────────────────────────

class QuoteRequest(BaseModel):
    coverage_type: Literal[
        "earthquake",
        "flood",
        "crop_multifactor",
        "hurricane",
        "stablecoin_depeg",
        "bridge_hack",
        # Legacy aliases kept for backwards compat
        "crop_drought",
        "crop_flood",
        "defi_hack",
        "flight_delay",
    ]
    payout_amount_usdc: float = Field(gt=0, le=500_000)
    duration_days: int = Field(ge=1, le=365)
    pool_utilization_pct: float = Field(default=50.0, ge=0, le=100)

    # Earthquake
    min_magnitude: Optional[float] = None      # e.g. 6.5
    seismic_region: Optional[str] = None       # e.g. "Pacific Ring"

    # Flood
    river: Optional[str] = None                # e.g. "Mississippi"
    gauge_threshold_ft: Optional[float] = None

    # Crop
    crop_region: Optional[str] = None          # e.g. "Iowa"
    score_threshold: Optional[int] = None      # e.g. 4000 (out of 10000)

    # Hurricane
    wind_threshold_knots: Optional[int] = None # e.g. 64

    # Stablecoin
    depeg_threshold_bps: Optional[int] = None  # e.g. 9700

    # Bridge
    tvl_drop_threshold_pct: Optional[int] = None  # e.g. 30

    # Legacy
    region: Optional[str] = None
    rainfall_threshold_mm: Optional[float] = None
    protocol_tvl_usd: Optional[float] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    delay_threshold_minutes: Optional[int] = None


class QuoteResponse(BaseModel):
    premium_usdc: float
    premium_pct: float
    risk_score: float
    confidence: str
    breakdown: dict


# ── Pricing Endpoint ──────────────────────────────────────────────────────

@app.post("/quote", response_model=QuoteResponse)
async def get_quote(req: QuoteRequest) -> QuoteResponse:
    try:
        util = req.pool_utilization_pct / 100
        payout = req.payout_amount_usdc
        days = req.duration_days

        if req.coverage_type == "earthquake":
            mag = req.min_magnitude or 6.5
            region = req.seismic_region or req.region or "Global"
            annual_prob, vol = _interpolate(EARTHQUAKE_RISK, mag)
            multiplier = REGION_SEISMIC_MULTIPLIER.get(region, 1.0)
            annual_prob = min(0.99, annual_prob * multiplier)
            result = _premium(annual_prob, vol, payout, days, util, min_rate=0.002)
            result["breakdown"]["magnitude_threshold"] = mag
            result["breakdown"]["region"] = region
            result["breakdown"]["seismic_multiplier"] = multiplier

        elif req.coverage_type == "flood":
            river = req.river or req.region or "DEFAULT"
            annual_prob, vol = FLOOD_RIVER_RISK.get(river, FLOOD_RIVER_RISK["DEFAULT"])
            # Higher gauge threshold = rarer event = lower probability
            if req.gauge_threshold_ft:
                # Simple scaling: each 5ft above 20ft halves the probability
                scale = 0.5 ** max(0, (req.gauge_threshold_ft - 20) / 5)
                annual_prob *= scale
            result = _premium(annual_prob, vol, payout, days, util, min_rate=0.003)
            result["breakdown"]["river"] = river
            if req.gauge_threshold_ft:
                result["breakdown"]["gauge_threshold_ft"] = req.gauge_threshold_ft

        elif req.coverage_type in ("crop_multifactor", "crop_drought", "crop_flood"):
            region = req.crop_region or req.region or "DEFAULT"
            annual_prob, vol = CROP_REGION_RISK.get(region, CROP_REGION_RISK["DEFAULT"])
            threshold = req.score_threshold or req.rainfall_threshold_mm or 4000
            # Lower threshold = harder to trigger = lower prob
            if isinstance(threshold, (int, float)) and threshold < 5000:
                scale = threshold / 5000
                annual_prob *= scale
            result = _premium(annual_prob, vol, payout, days, util, min_rate=0.004)
            result["breakdown"]["region"] = region
            result["breakdown"]["score_threshold"] = threshold

        elif req.coverage_type == "hurricane":
            knots = req.wind_threshold_knots or 64
            annual_prob, vol = _interpolate(HURRICANE_RISK_BY_KNOTS, knots)
            result = _premium(annual_prob, vol, payout, days, util, min_rate=0.005)
            result["breakdown"]["wind_threshold_knots"] = knots

        elif req.coverage_type == "stablecoin_depeg":
            threshold = req.depeg_threshold_bps or 9700
            annual_prob, vol = _interpolate(DEPEG_RISK, threshold)
            result = _premium(annual_prob, vol, payout, days, util, min_rate=0.001)
            result["breakdown"]["depeg_threshold_bps"] = threshold
            result["breakdown"]["depeg_threshold_usd"] = threshold / 10000

        elif req.coverage_type in ("bridge_hack", "defi_hack"):
            # Baseline: combined Wormhole + Stargate + Across TVL ~$1,730M
            baseline_tvl_m = 1730
            tvl_floor_m = req.tvl_drop_threshold_pct or 1500  # reused field: floor in $M
            implied_drop_pct = max(5, min(90, (baseline_tvl_m - tvl_floor_m) / baseline_tvl_m * 100))
            annual_prob, vol = _interpolate(BRIDGE_HACK_RISK, implied_drop_pct)
            result = _premium(annual_prob, vol, payout, days, util, min_rate=0.005)
            result["breakdown"]["tvl_floor_millions"] = tvl_floor_m
            result["breakdown"]["baseline_tvl_millions"] = baseline_tvl_m
            result["breakdown"]["implied_drop_pct"] = round(implied_drop_pct, 1)

        elif req.coverage_type == "flight_delay":
            # Legacy — basic pricing
            annual_prob, vol = 0.25, 0.20
            result = _premium(annual_prob, vol, payout, days, util, min_rate=0.005)

        else:
            result = _premium(0.05, 0.25, payout, days, util)

        premium_pct = (result["premium_usdc"] / payout) * 100
        return QuoteResponse(
            premium_usdc=result["premium_usdc"],
            premium_pct=round(premium_pct, 3),
            risk_score=result["risk_score"],
            confidence=result["confidence"],
            breakdown=result["breakdown"],
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Pricing error: {str(e)}")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "2.0.0",
        "models": ["earthquake", "flood", "crop_multifactor", "hurricane", "stablecoin_depeg", "bridge_hack"],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
