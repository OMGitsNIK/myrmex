"""Real-world data fetchers for each coverage type."""
import httpx
from datetime import date, timedelta
from app.config import (
    OPEN_METEO_BASE, DEFILLAMA_BASE,
    CROP_LAT, CROP_LON, DEFI_PROTOCOL,
)


async def get_rainfall_mm() -> float:
    """
    Fetch total precipitation (mm) for yesterday from Open-Meteo.
    Scaled x100 and stored as i64 on-chain (e.g. 12.5 mm → 1250).
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
    Fetch current TVL (USD) for a monitored DeFi protocol from DeFiLlama.
    Stored on-chain in whole USD (e.g. $4.2B → 4_200_000_000).
    """
    url = f"{DEFILLAMA_BASE}/tvl/{DEFI_PROTOCOL}"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return float(resp.text)


async def get_flight_delay_minutes(flight_iata: str = "AA100") -> int:
    """
    Returns estimated delay in minutes for a representative flight.
    Uses mock data since OpenSky doesn't provide delay info directly;
    in production replace with a paid aviation API (AviationStack etc.).
    """
    # Mock: returns 0 (on-time) unless env-overridden for demos
    import os
    mock_delay = int(os.environ.get("MOCK_FLIGHT_DELAY_MINUTES", "0"))
    return mock_delay
