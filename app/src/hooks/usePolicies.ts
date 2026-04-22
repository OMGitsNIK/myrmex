"use client";
import { useEffect, useState } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { API_URL } from "@/lib/constants";

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

export function usePolicies() {
  const wallet = useAnchorWallet();
  const [policies, setPolicies] = useState<PolicyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) {
      setPolicies([]);
      return;
    }
    setLoading(true);
    fetch(`${API_URL}/api/policies/${wallet.publicKey.toBase58()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        if (!Array.isArray(data)) throw new Error("Unexpected API response shape");
        setPolicies(data as PolicyData[]);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [wallet?.publicKey.toString()]);

  return { policies, loading, error };
}
