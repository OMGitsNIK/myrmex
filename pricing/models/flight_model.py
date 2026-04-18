ROUTE_DELAY_RATES = {
    ("BOM", "DEL"): (0.18, 45),
    ("JFK", "LAX"): (0.22, 55),
    ("LHR", "CDG"): (0.12, 30),
    ("SIN", "BKK"): (0.15, 35),
    ("BLR", "BOM"): (0.20, 50),
    ("DEFAULT", "DEFAULT"): (0.20, 40),
}


class FlightPriceModel:
    """Actuarial flight delay pricing: Premium = E[loss] * utilization_loading * margin."""

    def price(
        self,
        origin: str,
        destination: str,
        delay_threshold_minutes: int,
        payout_amount: float,
        duration_days: int,
        pool_utilization: float,
    ) -> dict:
        route_key = (origin.upper(), destination.upper())
        base_prob, _ = ROUTE_DELAY_RATES.get(
            route_key, ROUTE_DELAY_RATES[("DEFAULT", "DEFAULT")]
        )

        threshold_factor = max(0.1, 1 - (delay_threshold_minutes - 60) / 300)
        adjusted_prob = base_prob * threshold_factor

        period_prob = 1 - (1 - adjusted_prob) ** duration_days

        expected_loss = period_prob * payout_amount
        loading = 1.0 + (pool_utilization * 0.6)
        premium = max(0.50, round(expected_loss * loading * 1.20, 2))

        return {
            "premium_usdc": premium,
            "risk_score": round(min(100, period_prob * 200), 1),
            "confidence": "high" if route_key in ROUTE_DELAY_RATES else "low",
            "breakdown": {
                "route": f"{origin}-{destination}",
                "trigger_probability": round(period_prob, 4),
                "expected_loss_usdc": round(expected_loss, 2),
                "utilization_loading": round(loading, 3),
                "profit_margin": 0.20,
            },
        }
