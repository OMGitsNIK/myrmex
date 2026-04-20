"""
Scheduled oracle jobs — one per coverage type.
Each job: fetch data → Claude verification → post on-chain if triggered.
"""
import logging
from datetime import date, timedelta
from app import data_sources, ai_verifier, chain
from app.config import FLIGHT_POOL, CROP_POOL, DEFI_POOL

logger = logging.getLogger("oracle")


async def run_crop_drought_job():
    """Fetch rainfall data, verify with Claude, post report to crop pool."""
    if not CROP_POOL:
        logger.warning("CROP_POOL not configured, skipping crop job")
        return

    try:
        rainfall_mm = await data_sources.get_rainfall_mm()
        # Threshold: 2mm/day is a common drought indicator
        threshold_mm = 2.0
        verification = ai_verifier.verify_rainfall_event(rainfall_mm, threshold_mm)

        logger.info(
            f"Crop oracle: rainfall={rainfall_mm:.2f}mm, "
            f"AI approved={verification['approved']}, "
            f"reasoning={verification['reasoning']}"
        )

        # Report the value regardless — let the on-chain trigger condition decide payout.
        # Scale: mm * 100 stored as i64 (e.g. 1.5mm → 150)
        reported_value = int(rainfall_mm * 100)
        description = (
            f"Rainfall {rainfall_mm:.2f}mm on {(date.today()-timedelta(days=1)).isoformat()}. "
            f"AI: {verification['reasoning']}"
        )

        sig = await chain.post_oracle_report(CROP_POOL, reported_value, description)
        logger.info(f"Crop oracle report posted: {sig}")
    except Exception as e:
        logger.error(f"Crop oracle job failed: {e}")


async def run_defi_hack_job():
    """Fetch DeFi TVL data, verify with Claude, post report to DeFi pool."""
    if not DEFI_POOL:
        logger.warning("DEFI_POOL not configured, skipping defi job")
        return

    try:
        current_tvl = await data_sources.get_defi_tvl_usd()
        # Use 7-day cached baseline or fall back to current * 1.5 for first run
        # In production this would be stored in a DB
        baseline_tvl = current_tvl * 1.0  # placeholder — see TODO below
        drop_threshold_pct = 20.0  # 20% TVL drop = hack signal

        verification = ai_verifier.verify_defi_hack(
            current_tvl, baseline_tvl, drop_threshold_pct
        )

        logger.info(
            f"DeFi oracle: tvl=${current_tvl:,.0f}, "
            f"AI approved={verification['approved']}, "
            f"reasoning={verification['reasoning']}"
        )

        # Report TVL in millions (scaled) to fit i64 safely
        reported_value = int(current_tvl / 1_000_000)
        description = (
            f"DeFi TVL ${current_tvl/1e9:.2f}B. "
            f"AI: {verification['reasoning']}"
        )

        sig = await chain.post_oracle_report(DEFI_POOL, reported_value, description)
        logger.info(f"DeFi oracle report posted: {sig}")
    except Exception as e:
        logger.error(f"DeFi oracle job failed: {e}")


async def run_flight_job():
    """Fetch flight delay data, verify with Claude, post report to flight pool."""
    if not FLIGHT_POOL:
        logger.warning("FLIGHT_POOL not configured, skipping flight job")
        return

    try:
        delay_minutes = await data_sources.get_flight_delay_minutes()
        threshold_minutes = 120  # 2-hour delay threshold

        verification = ai_verifier.verify_flight_delay(delay_minutes, threshold_minutes)

        logger.info(
            f"Flight oracle: delay={delay_minutes}min, "
            f"AI approved={verification['approved']}, "
            f"reasoning={verification['reasoning']}"
        )

        reported_value = delay_minutes
        description = (
            f"Flight delay {delay_minutes} min. "
            f"AI: {verification['reasoning']}"
        )

        sig = await chain.post_oracle_report(FLIGHT_POOL, reported_value, description)
        logger.info(f"Flight oracle report posted: {sig}")
    except Exception as e:
        logger.error(f"Flight oracle job failed: {e}")
