"""
MYRMEX Oracle AI Service
FastAPI app that:
  1. Runs scheduled jobs every POLL_INTERVAL_SECS to fetch real-world data,
     verify with Claude, and post OracleReport accounts on-chain.
  2. Exposes REST endpoints for manual triggers and status checks (useful for demos).
"""
import logging
import asyncio
import hashlib
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import POLL_INTERVAL_SECS
from app import ai_verifier, chain, data_sources
from app.oracle_jobs import run_crop_drought_job, run_defi_hack_job, run_flight_job

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("oracle")

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(run_crop_drought_job, "interval", seconds=POLL_INTERVAL_SECS, id="crop")
    scheduler.add_job(run_defi_hack_job, "interval", seconds=POLL_INTERVAL_SECS, id="defi")
    scheduler.add_job(run_flight_job, "interval", seconds=POLL_INTERVAL_SECS, id="flight")
    scheduler.start()
    logger.info(f"Oracle scheduler started (interval={POLL_INTERVAL_SECS}s)")
    yield
    scheduler.shutdown()


app = FastAPI(title="MYRMEX Oracle AI Service", lifespan=lifespan)


# ── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "myrmex-oracle"}


# ── Manual trigger endpoints (demo / admin) ──────────────────────────────────

class ManualReportRequest(BaseModel):
    pool: str
    reported_value: int
    description: str = "Manual oracle report"
    scope_seed: str = "default"


@app.post("/oracle/post-report")
async def post_report_manual(req: ManualReportRequest):
    """Directly post an oracle report to the given pool (admin/demo use)."""
    try:
        sig = await chain.post_oracle_report(
            req.pool,
            req.reported_value,
            req.description,
            hashlib.sha256(req.scope_seed.encode("utf-8")).digest(),
        )
        return {"success": True, "signature": sig}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/oracle/run/crop")
async def trigger_crop():
    """Manually trigger crop drought oracle job."""
    await run_crop_drought_job()
    return {"triggered": "crop"}


@app.post("/oracle/run/defi")
async def trigger_defi():
    """Manually trigger DeFi hack oracle job."""
    await run_defi_hack_job()
    return {"triggered": "defi"}


@app.post("/oracle/run/flight")
async def trigger_flight():
    """Manually trigger flight delay oracle job."""
    await run_flight_job()
    return {"triggered": "flight"}


# ── Data preview endpoints (no on-chain write) ───────────────────────────────

@app.get("/oracle/data/rainfall")
async def get_rainfall():
    mm = await data_sources.get_rainfall_mm()
    return {"rainfall_mm": mm, "on_chain_value": int(mm * 100)}


@app.get("/oracle/data/defi-tvl")
async def get_defi_tvl():
    tvl = await data_sources.get_defi_tvl_usd()
    return {"tvl_usd": tvl, "on_chain_value": int(tvl / 1_000_000)}


@app.get("/oracle/data/flight-delay")
async def get_flight_delay():
    delay = await data_sources.get_flight_delay_minutes()
    return {"delay_minutes": delay}


# ── AI verification preview (no on-chain write) ──────────────────────────────

class VerifyRainfallRequest(BaseModel):
    rainfall_mm: float
    threshold_mm: float


@app.post("/oracle/verify/rainfall")
async def verify_rainfall(req: VerifyRainfallRequest):
    result = ai_verifier.verify_rainfall_event(req.rainfall_mm, req.threshold_mm)
    return result


class VerifyDefiRequest(BaseModel):
    current_tvl: float
    baseline_tvl: float
    drop_threshold_pct: float


@app.post("/oracle/verify/defi")
async def verify_defi(req: VerifyDefiRequest):
    result = ai_verifier.verify_defi_hack(
        req.current_tvl, req.baseline_tvl, req.drop_threshold_pct
    )
    return result


class VerifyFlightRequest(BaseModel):
    delay_minutes: int
    threshold_minutes: int


@app.post("/oracle/verify/flight")
async def verify_flight(req: VerifyFlightRequest):
    result = ai_verifier.verify_flight_delay(req.delay_minutes, req.threshold_minutes)
    return result
