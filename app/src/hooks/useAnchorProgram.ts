"use client";
import { useMemo } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";

export function useAnchorProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const provider = useMemo(() => {
    if (!wallet) return null;
    return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    // Dynamic import of IDL at runtime
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const idl = require("@/idl/myrmex.json");
      return new Program(idl, provider);
    } catch {
      return null;
    }
  }, [provider]);

  return { program, provider, wallet, connected: !!wallet };
}
