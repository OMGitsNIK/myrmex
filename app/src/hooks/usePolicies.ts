"use client";
import { useEffect, useState } from "react";
import { useAnchorProgram } from "./useAnchorProgram";

export function usePolicies() {
  const { program, wallet } = useAnchorProgram();
  const [policies, setPolicies] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!program || !wallet) return;
    setLoading(true);
    (program as any).account.policyVault
      .all([
        {
          memcmp: {
            offset: 8,
            bytes: wallet.publicKey.toBase58(),
          },
        },
      ])
      .then(setPolicies)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [program, wallet?.publicKey.toString()]);

  return { policies, loading };
}
