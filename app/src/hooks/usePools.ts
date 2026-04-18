"use client";
import { useEffect, useState } from "react";
import { useAnchorProgram } from "./useAnchorProgram";

export function usePools() {
  const { program } = useAnchorProgram();
  const [pools, setPools] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!program) return;
    setLoading(true);
    (program as any).account.riskPool
      .all()
      .then(setPools)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [program]);

  return { pools, loading };
}
