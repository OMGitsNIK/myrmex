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
    if (!wallet) return;
    setLoading(true);
    fetch(`${API_URL}/api/policies/${wallet.publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((data) => { setPolicies(data); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [wallet?.publicKey.toString()]);

  return { policies, loading, error };
}
