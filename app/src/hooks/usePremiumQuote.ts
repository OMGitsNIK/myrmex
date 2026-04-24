"use client";
import { useState, useEffect } from "react";
import { PRICING_API } from "@/lib/constants";

export interface QuoteRequest {
  coverage_type: string;
  payout_amount_usdc: number;
  duration_days: number;
  origin?: string;
  destination?: string;
  delay_threshold_minutes?: number;
  region?: string;
  rainfall_threshold_mm?: number;
  protocol_tvl_usd?: number;
  pool_utilization_pct?: number;
}

export interface Quote {
  premium_usdc: number;
  premium_pct: number;
  risk_score: number;
  confidence: "high" | "medium" | "low";
  breakdown: Record<string, unknown>;
}

// Local rate estimates used when the pricing API is unreachable.
// These are flat-rate approximations — NOT from the actuarial model.
function localFallbackQuote(params: QuoteRequest): Quote {
  // Rates are floored at 5% (500 bps) to match on-chain minPremiumBps
  const base: Record<string, number> = {
    earthquake:        0.055,
    flood:             0.060,
    crop_multifactor:  0.075,
    hurricane:         0.080,
    stablecoin_depeg:  0.050,
    bridge_hack:       0.065,
  };
  const rate = base[params.coverage_type] ?? 0.03;
  const durationFactor = Math.min(params.duration_days / 30, 3);
  const premium_pct = rate * durationFactor;
  const premium_usdc = parseFloat(
    (params.payout_amount_usdc * premium_pct).toFixed(2)
  );
  const risk_score = Math.round(premium_pct * 600);
  return {
    premium_usdc,
    premium_pct: parseFloat((premium_pct * 100).toFixed(3)),
    risk_score: Math.min(risk_score, 99),
    confidence: "medium",
    breakdown: { source: "local_fallback" },
  };
}

export const FALLBACK_WARNING =
  "Pricing API offline — showing estimated flat rates. Purchase is disabled until the API is reachable.";

export function usePremiumQuote(params: QuoteRequest | null) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    if (!params || params.payout_amount_usdc <= 0) {
      setQuote(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      setIsFallback(false);
      try {
        const res = await fetch(`${PRICING_API}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(await res.text());
        const data: Quote = await res.json();
        setQuote(data);
      } catch (e: unknown) {
        const err = e as Error;
        if (err.name === "AbortError") return;
        // Pricing API unreachable — use local flat-rate fallback and flag it
        setQuote(localFallbackQuote(params));
        setIsFallback(true);
        setError(FALLBACK_WARNING);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);

  return { quote, loading, error, isFallback };
}
