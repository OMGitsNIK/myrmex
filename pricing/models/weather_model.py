REGION_DROUGHT_RISK = {
    "Maharashtra": (0.35, 45),
    "Rajasthan": (0.55, 80),
    "Andhra Pradesh": (0.25, 35),
    "Karnataka": (0.30, 40),
    "Punjab": (0.10, 15),
    "DEFAULT": (0.25, 40),
}

REGION_FLOOD_RISK = {
    "Kerala": (0.40, 200),
    "Assam": (0.60, 300),
    "Bihar": (0.50, 250),
    "West Bengal": (0.45, 220),
    "DEFAULT": (0.20, 100),
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
        else:
            risk_data = REGION_FLOOD_RISK.get(region, REGION_FLOOD_RISK["DEFAULT"])

        annual_prob = risk_data[0]
        period_prob = 1 - (1 - annual_prob) ** (duration_days / 365)
        expected_loss = period_prob * payout_amount
        loading = 1.0 + (pool_utilization * 0.6)
        premium = max(1.0, round(expected_loss * loading * 1.25, 2))

        return {
            "premium_usdc": premium,
            "risk_score": round(period_prob * 100, 1),
            "confidence": "high" if region in REGION_DROUGHT_RISK else "medium",
            "breakdown": {
                "region": region,
                "annual_probability": annual_prob,
                "period_probability": round(period_prob, 4),
                "expected_loss_usdc": round(expected_loss, 2),
                "loading": round(loading, 3),
            },
        }
