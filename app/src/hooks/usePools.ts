"use client";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/constants";

export interface PoolData {
  pubkey: string;
  poolType: number;
  totalLiquidity: number;
  totalLocked: number;
  available: number;
  utilizationPct: string;
  estimatedApy: string;
  activePolicies: number;
  isActive: boolean;
  // On-chain extras (populated when wallet connected via pool page directly)
  lpTokenMint?: string;
  vault?: string;
}

export function usePools() {
  const [pools, setPools] = useState<PoolData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/api/pools`)
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        if (!Array.isArray(data))
          throw new Error("Unexpected API response shape");
        setPools(data as PoolData[]);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { pools, loading, error };
}
