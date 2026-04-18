from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal, Optional
from models.flight_model import FlightPriceModel
from models.weather_model import WeatherPriceModel
from models.defi_model import DefiPriceModel

app = FastAPI(title="MYRMEX Pricing API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

flight_model = FlightPriceModel()
weather_model = WeatherPriceModel()
defi_model = DefiPriceModel()


class QuoteRequest(BaseModel):
    coverage_type: Literal[
        "flight_delay",
        "crop_drought",
        "crop_flood",
        "defi_hack",
        "stablecoin_depeg",
        "hurricane",
        "hospitalization",
    ]
    payout_amount_usdc: float = Field(gt=0, le=100000)
    duration_days: int = Field(ge=1, le=365)
    origin: Optional[str] = None
    destination: Optional[str] = None
    delay_threshold_minutes: Optional[int] = None
    region: Optional[str] = None
    rainfall_threshold_mm: Optional[float] = None
    protocol_address: Optional[str] = None
    protocol_tvl_usd: Optional[float] = None
    pool_utilization_pct: float = Field(default=50.0, ge=0, le=100)


class QuoteResponse(BaseModel):
    premium_usdc: float
    premium_pct: float
    risk_score: float
    confidence: str
    breakdown: dict


@app.post("/quote", response_model=QuoteResponse)
async def get_quote(req: QuoteRequest) -> QuoteResponse:
    try:
        if req.coverage_type == "flight_delay":
            if not all([req.origin, req.destination, req.delay_threshold_minutes]):
                raise HTTPException(
                    400,
                    "Flight coverage requires origin, destination, delay_threshold_minutes",
                )
            result = flight_model.price(
                origin=req.origin,
                destination=req.destination,
                delay_threshold_minutes=req.delay_threshold_minutes,
                payout_amount=req.payout_amount_usdc,
                duration_days=req.duration_days,
                pool_utilization=req.pool_utilization_pct / 100,
            )

        elif req.coverage_type in ("crop_drought", "crop_flood"):
            if not req.region:
                raise HTTPException(400, "Weather coverage requires region")
            result = weather_model.price(
                region=req.region,
                coverage_type=req.coverage_type,
                threshold=req.rainfall_threshold_mm or 20.0,
                payout_amount=req.payout_amount_usdc,
                duration_days=req.duration_days,
                pool_utilization=req.pool_utilization_pct / 100,
            )

        elif req.coverage_type in ("defi_hack", "stablecoin_depeg"):
            result = defi_model.price(
                coverage_type=req.coverage_type,
                protocol_tvl=req.protocol_tvl_usd or 1_000_000,
                payout_amount=req.payout_amount_usdc,
                duration_days=req.duration_days,
                pool_utilization=req.pool_utilization_pct / 100,
            )

        else:
            annual_rate = 0.05
            premium = req.payout_amount_usdc * annual_rate * (req.duration_days / 365)
            result = {
                "premium_usdc": round(max(0.50, premium), 2),
                "risk_score": 50.0,
                "confidence": "low",
                "breakdown": {
                    "base_rate": annual_rate,
                    "duration_factor": req.duration_days / 365,
                },
            }

        premium_pct = (result["premium_usdc"] / req.payout_amount_usdc) * 100
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
    return {"status": "ok", "models": ["flight", "weather", "defi"]}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
