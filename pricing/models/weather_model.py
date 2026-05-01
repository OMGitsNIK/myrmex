# Annual flood exceedance probabilities by US river basin / USGS gauge region.
# Source: USGS National Flood Frequency study + FEMA NFIP loss statistics.
# Format: (annual_exceedance_prob, typical_gauge_threshold_cfs)
# Thresholds are 5-year flood stage in cubic feet per second.
REGION_FLOOD_RISK = {
    # Midwest — Mississippi / Missouri basin
    "Mississippi-Upper":    (0.28, 250_000),
    "Mississippi-Lower":    (0.32, 400_000),
    "Missouri":             (0.24, 180_000),
    "Ohio":                 (0.22, 140_000),
    "Arkansas":             (0.18, 80_000),
    # South / Gulf
    "Red-River":            (0.30, 90_000),
    "Colorado-TX":          (0.15, 50_000),
    "Sabine":               (0.26, 70_000),
    "Brazos":               (0.20, 60_000),
    # East
    "Hudson":               (0.12, 30_000),
    "Susquehanna":          (0.16, 45_000),
    "Potomac":              (0.14, 35_000),
    "Connecticut":          (0.13, 28_000),
    # West
    "Sacramento":           (0.18, 110_000),
    "Columbia":             (0.10, 200_000),
    "Willamette":           (0.15, 60_000),
    # Generic fallback
    "DEFAULT":              (0.20, 80_000),
}

# Crop drought risk by US agricultural region.
# annual_exceedance_prob calibrated to USDA drought loss data 2000–2023.
# Format: (annual_prob, expected_loss_pct_of_yield)
REGION_DROUGHT_RISK = {
    "Great-Plains":         (0.30, 40),  # Kansas, Nebraska, Oklahoma
    "Corn-Belt":            (0.18, 25),  # Iowa, Illinois, Indiana
    "Delta":                (0.20, 28),  # Mississippi, Arkansas rice
    "Southeast":            (0.22, 30),  # Georgia, Carolinas
    "Southwest":            (0.45, 65),  # Texas, New Mexico, Arizona
    "Pacific-Northwest":    (0.12, 18),  # Washington, Oregon wheat
    "California-Central":   (0.35, 50),  # Central Valley
    "Northern-Plains":      (0.28, 38),  # North Dakota, South Dakota
    "DEFAULT":              (0.25, 35),
}


class WeatherPriceModel:
    def price(
        self,
        region: str,
        coverage_type: str,
        threshold: float,
        payout_amount: float,
        duration_days: int,
        pool_utilization: float,
    ) -> dict:
        if coverage_type == "crop_drought":
            risk_data = REGION_DROUGHT_RISK.get(region, REGION_DROUGHT_RISK["DEFAULT"])
            annual_prob = risk_data[0]
            # Threshold is Palmer Drought Severity Index (negative = drought).
            # More negative threshold = rarer event = lower probability.
            if threshold < 0:
                severity_factor = max(0.3, 1.0 + threshold / 4.0)
                annual_prob = annual_prob * severity_factor
        else:
            # Flood: threshold is gauge reading in cfs relative to regional 5-yr flood.
            risk_data = REGION_FLOOD_RISK.get(region, REGION_FLOOD_RISK["DEFAULT"])
            annual_prob = risk_data[0]
            typical_cfs = risk_data[1]
            # Higher threshold relative to typical = rarer trigger = lower probability.
            if threshold > 0 and typical_cfs > 0:
                ratio = threshold / typical_cfs
                # Flood frequency follows approximate power law: P(Q>x) ~ (Q_2yr/x)^k, k≈2
                annual_prob = annual_prob * max(0.02, min(2.0, (1.0 / ratio) ** 1.8))

        annual_prob = max(0.01, min(0.95, annual_prob))
        period_prob = 1 - (1 - annual_prob) ** (duration_days / 365)
        expected_loss = period_prob * payout_amount
        # Utilization loading: higher pool utilization → higher premium
        loading = 1.0 + (pool_utilization * 0.6)
        # Volatility loading: flood has higher variance than drought
        vol_factor = 1.35 if coverage_type != "crop_drought" else 1.20
        premium = max(1.0, round(expected_loss * loading * vol_factor, 2))

        is_us_region = region in REGION_FLOOD_RISK or region in REGION_DROUGHT_RISK
        return {
            "premium_usdc": premium,
            "risk_score": round(period_prob * 100, 1),
            "confidence": "high" if is_us_region else "medium",
            "breakdown": {
                "region": region,
                "coverage_type": coverage_type,
                "annual_probability": round(annual_prob, 4),
                "period_probability": round(period_prob, 4),
                "expected_loss_usdc": round(expected_loss, 2),
                "vol_loading": vol_factor,
                "util_loading": round(loading, 3),
            },
        }
