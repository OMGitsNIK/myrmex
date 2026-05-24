"use client";
import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { API_URL } from "@/lib/constants";
import { fetchPoolsOnChain, fetchWithTimeout } from "@/lib/onchain";

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

export type PoolSource = "api" | "onchain";

export function usePools() {
  const { connection } = useConnection();
  const [pools, setPools] = useState<PoolData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<PoolSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        const res = await fetchWithTimeout(`${API_URL}/api/pools`, 4000);
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data))
          throw new Error("Unexpected API response shape");
        if (cancelled) return;
        setPools(data as PoolData[]);
        setSource("api");
      } catch {
        try {
          const onchain = await fetchPoolsOnChain(connection);
          if (cancelled) return;
          setPools(onchain as unknown as PoolData[]);
          setSource("onchain");
        } catch (chainErr) {
          if (cancelled) return;
          setError((chainErr as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [connection]);

  return { pools, loading, error, source };
}
