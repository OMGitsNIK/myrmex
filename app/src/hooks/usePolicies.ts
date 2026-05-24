"use client";
import { useEffect, useState } from "react";
import {
  useAnchorWallet,
  useConnection,
} from "@solana/wallet-adapter-react";
import { API_URL } from "@/lib/constants";
import { fetchPoliciesOnChain, fetchWithTimeout } from "@/lib/onchain";

export interface PolicyData {
  pubkey: string;
  account: {
    policyholder: string;
    pool: string;
    coverageType: number;
    payoutAmount: number;
    premiumAmount: number;
    triggerCondition: {
      oraclePubkey: string;
      scopeHash: number[];
      threshold: number;
      comparison: number;
    };
    expiresAt: number;
    createdAt: number;
    isActive: boolean;
    isClaimed: boolean;
    bump: number;
  };
}

export type PolicySource = "api" | "onchain";

export function usePolicies() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const [policies, setPolicies] = useState<PolicyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<PolicySource | null>(null);

  useEffect(() => {
    if (!wallet) {
      setPolicies([]);
      setSource(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async () => {
      const walletStr = wallet.publicKey.toBase58();
      try {
        const res = await fetchWithTimeout(
          `${API_URL}/api/policies/${walletStr}`,
          4000
        );
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data))
          throw new Error("Unexpected API response shape");
        if (cancelled) return;
        setPolicies(data as PolicyData[]);
        setSource("api");
      } catch {
        try {
          const onchain = await fetchPoliciesOnChain(
            connection,
            wallet.publicKey
          );
          if (cancelled) return;
          setPolicies(onchain as unknown as PolicyData[]);
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
  }, [wallet?.publicKey.toString(), connection]);

  return { policies, loading, error, source };
}
