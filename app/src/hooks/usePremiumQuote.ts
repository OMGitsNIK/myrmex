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
  quote_signature?: number[];
  quote_expiry?: number;
  pricing_authority?: string;
}

export const FALLBACK_WARNING =
  "Pricing API offline — showing estimated flat rates. Purchase is disabled until the API is reachable.";

export function usePremiumQuote(params: any) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    if (!params?.payout_amount_usdc || params.payout_amount_usdc <= 0) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    const fetchQuote = async () => {
      setLoading(true);
      setError(null);
      setIsFallback(false);

      try {
        const res = await fetch(`${PRICING_API}/api/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to fetch quote");
        }

        const data = await res.json();
        if (!cancelled) {
          setQuote(data);
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error("Pricing API Error:", err);
        setError(FALLBACK_WARNING);
        setIsFallback(true);

        // Fallback estimate: 1% flat rate for demo UI
        setQuote({
          premium_usdc: params.payout_amount_usdc * 0.01,
          premium_pct: 1.0,
          risk_score: 1.0,
          confidence: "low",
          breakdown: { source: "local_fallback" },
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(fetchQuote, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    params?.coverage_type,
    params?.payout_amount_usdc,
    params?.duration_days,
    params?.min_magnitude,
    params?.gauge_threshold_ft,
    params?.score_threshold,
    params?.wind_threshold_knots,
    params?.depeg_threshold_bps,
    params?.tvl_drop_threshold_pct,
  ]);

  return { quote, loading, error, isFallback };
}
