"""
Scheduled oracle jobs — one per coverage type.

Each job fetches real-world data from a SINGLE external provider, runs an
optional Claude AI plausibility check, then posts an OracleReport on-chain
regardless of whether the trigger condition is met (the on-chain program
decides payout eligibility at claim time).

DATA SOURCE SUMMARY (demo build)
─────────────────────────────────
  crop    — Open-Meteo (precipitation_sum, single provider)
  defi    — DeFiLlama TVL endpoint (single provider);
             baseline_tvl = current × 1.0 (no historic comparison)
  flight  — Mock only (MOCK_FLIGHT_DELAY_MINUTES env var)
"""
import logging
import hashlib
from datetime import date, timedelta
from app import data_sources, ai_verifier, chain
from app.config import FLIGHT_POOL, CROP_POOL, DEFI_POOL

logger = logging.getLogger("oracle")


def _scope(seed: str) -> bytes:
    return hashlib.sha256(seed.encode("utf-8")).digest()


async def run_crop_drought_job():
    """Fetch rainfall data (Open-Meteo, single provider), verify with Claude, post report to crop pool.

    DATA SOURCE: Open-Meteo /forecast?daily=precipitation_sum (sole source, no cross-check).
    """
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

        sig = await chain.post_oracle_report(
            CROP_POOL,
            reported_value,
            description,
            _scope("crop_multifactor:Iowa"),
        )
        logger.info(f"Crop oracle report posted: {sig}")
    except Exception as e:
        logger.error(f"Crop oracle job failed: {e}")


async def run_defi_hack_job():
    """Fetch DeFi TVL (DeFiLlama, single provider), verify with Claude, post report to DeFi pool.

    DATA SOURCE: DeFiLlama /tvl/{protocol} (sole source, no cross-check).
    NOTE: baseline_tvl is set to current_tvl × 1.0 — no historical high-water mark
    is stored, so drop detection only works across consecutive poll intervals.
    """
    if not DEFI_POOL:
        logger.warning("DEFI_POOL not configured, skipping defi job")
        return

    try:
        current_tvl = await data_sources.get_defi_tvl_usd()
        # Use 7-day cached baseline or fall back to current * 1.5 for first run
        # In production this would be stored in a DB
        baseline_tvl = current_tvl * 1.0  # No stored historic baseline — same-tick comparison only
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

        sig = await chain.post_oracle_report(
            DEFI_POOL,
            reported_value,
            description,
            _scope("bridge_hack:wormhole-stargate-across"),
        )
        logger.info(f"DeFi oracle report posted: {sig}")
    except Exception as e:
        logger.error(f"DeFi oracle job failed: {e}")


async def run_flight_job():
    """Fetch flight delay data (MOCK ONLY), verify with Claude, post report to flight pool.

    DATA SOURCE: Mock — reads MOCK_FLIGHT_DELAY_MINUTES env var (default 0).
    No live aviation API is connected in this build.
    """
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

        sig = await chain.post_oracle_report(
            FLIGHT_POOL,
            reported_value,
            description,
            _scope("flight_delay:default"),
        )
        logger.info(f"Flight oracle report posted: {sig}")
    except Exception as e:
        logger.error(f"Flight oracle job failed: {e}")
