TVL_RISK_TIERS = [
    (100_000, 0.15),
    (1_000_000, 0.08),
    (10_000_000, 0.05),
    (100_000_000, 0.03),
    (float("inf"), 0.02),
]


class DefiPriceModel:
    DEPEG_ANNUAL_PROB = 0.04

    def price(
        self,
        coverage_type: str,
        protocol_tvl: float,
        payout_amount: float,
        duration_days: int,
        pool_utilization: float,
    ) -> dict:
        if coverage_type == "defi_hack":
            annual_prob = next(p for t, p in TVL_RISK_TIERS if protocol_tvl < t)
        else:
            annual_prob = self.DEPEG_ANNUAL_PROB

        period_prob = 1 - (1 - annual_prob) ** (duration_days / 365)
        expected_loss = period_prob * payout_amount
        loading = 1.0 + (pool_utilization * 0.8)
        premium = max(0.50, round(expected_loss * loading * 1.30, 2))

        return {
            "premium_usdc": premium,
            "risk_score": round(period_prob * 100, 1),
            "confidence": "medium",
            "breakdown": {
                "coverage_type": coverage_type,
                "protocol_tvl_usd": protocol_tvl,
                "annual_prob": annual_prob,
                "period_prob": round(period_prob, 4),
                "expected_loss_usdc": round(expected_loss, 2),
            },
        }
