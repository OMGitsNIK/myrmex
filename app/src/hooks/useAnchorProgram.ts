"use client";
import { useMemo } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";

export function useAnchorProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  // Stable string key — changes when wallet disconnects or user switches accounts.
  // Pages use this as a useEffect dependency to reset stale balances/state.
  const walletPublicKey = wallet?.publicKey?.toBase58() ?? null;

  const provider = useMemo(() => {
    if (!wallet) return null;
    return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const idl = require("@/idl/myrmex.json");
      return new Program(idl, provider);
    } catch {
      return null;
    }
  }, [provider]);

  return { program, provider, wallet, walletPublicKey, connected: !!wallet };
}
