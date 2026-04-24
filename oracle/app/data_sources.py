"""
Real-world data fetchers for each coverage type.

DATA SOURCE LIMITATIONS (demo build)
──────────────────────────────────────
• Each fetcher uses a SINGLE provider — no cross-source validation is performed.
• Crop drought: Open-Meteo only (free tier, precipitation_sum).
• DeFi hack:   DeFiLlama only (TVL endpoint); no historical baseline stored —
               current TVL is compared against itself (baseline_tvl = current × 1.0).
• Flight delay: Mock only — reads MOCK_FLIGHT_DELAY_MINUTES env var (default 0).
               No live aviation API is connected.
"""
import httpx
from datetime import date, timedelta
from app.config import (
    OPEN_METEO_BASE, DEFILLAMA_BASE,
    CROP_LAT, CROP_LON, DEFI_PROTOCOL,
)


async def get_rainfall_mm() -> float:
    """
    Fetch total precipitation (mm) for yesterday from Open-Meteo (sole source).
    Scaled x100 and stored as i64 on-chain (e.g. 12.5 mm → 1250).

    NOTE: Single-provider — no secondary source cross-check.
    """
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    url = (
        f"{OPEN_METEO_BASE}/forecast"
        f"?latitude={CROP_LAT}&longitude={CROP_LON}"
        f"&daily=precipitation_sum&timezone=auto"
        f"&start_date={yesterday}&end_date={yesterday}"
    )
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
        mm = data["daily"]["precipitation_sum"][0] or 0.0
        return mm


async def get_defi_tvl_usd() -> float:
    """
    Fetch current TVL (USD) for a monitored DeFi protocol from DeFiLlama (sole source).
    Stored on-chain in whole USD (e.g. $4.2B → 4_200_000_000).

    NOTE: Single-provider — no secondary source cross-check.
    No historical baseline is stored; the oracle job compares current TVL against
    itself (baseline_tvl = current × 1.0), so a genuine drop will only be detected
    across consecutive poll intervals, not against a true historical high-water mark.
    """
    url = f"{DEFILLAMA_BASE}/tvl/{DEFI_PROTOCOL}"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return float(resp.text)


async def get_flight_delay_minutes(flight_iata: str = "AA100") -> int:
    """
    Returns delay in minutes for a representative flight.

    ⚠  MOCK DATA — No live aviation API is connected.
    Returns the value of the MOCK_FLIGHT_DELAY_MINUTES env var (default 0).
    In production, replace with a paid API such as AviationStack or FlightAware.
    """
    # Mock only: returns 0 (on-time) unless env-overridden for demos
    import os
    mock_delay = int(os.environ.get("MOCK_FLIGHT_DELAY_MINUTES", "0"))
    return mock_delay
