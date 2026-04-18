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

export function usePremiumQuote(params: QuoteRequest | null) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params || params.payout_amount_usdc <= 0) {
      setQuote(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
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
        if (err.name !== "AbortError") setError(err.message);
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

  return { quote, loading, error };
}
