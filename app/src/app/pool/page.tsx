"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { usePools } from "@/hooks/usePools";
import { useAnchorProgram } from "@/hooks/useAnchorProgram";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { USDC_MINT, explorerUrl } from "@/lib/constants";

export default function PoolPage() {
  const { pools, loading } = usePools();
  const { program, wallet } = useAnchorProgram();
  const [depositAmounts, setDepositAmounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const handleDeposit = async (poolPubkey: string) => {
    if (!program || !wallet) return;
    const amount = Number(depositAmounts[poolPubkey]);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid deposit amount");
      return;
    }
    setSubmitting(poolPubkey);
    try {
      const poolPk = new PublicKey(poolPubkey);
      const poolAccount = await (program as any).account.riskPool.fetch(poolPk) as any;
      const lpMint = poolAccount.lpTokenMint as PublicKey;
      const poolVault = poolAccount.vault as PublicKey;

      const lpMintKey = new PublicKey(lpMint);
      const providerUsdc = getAssociatedTokenAddressSync(USDC_MINT, wallet.publicKey);
      const providerLpTokens = getAssociatedTokenAddressSync(lpMintKey, wallet.publicKey);

      // Ensure USDC ATA exists — LP token ATA is handled by init_if_needed in the program
      const connection = program.provider.connection;
      const setupTx = new Transaction();
      setupTx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey, providerUsdc, wallet.publicKey, USDC_MINT
        )
      );
      const { blockhash } = await connection.getLatestBlockhash();
      setupTx.recentBlockhash = blockhash;
      setupTx.feePayer = wallet.publicKey;
      await (program.provider as any).sendAndConfirm(setupTx);

      const tx = await program.methods
        .fundPool(new anchor.BN(Math.floor(amount * 1_000_000)))
        .accounts({
          provider: wallet.publicKey,
          pool: poolPk,
          providerUsdc,
          poolVault,
          lpTokenMint: lpMint,
          providerLpTokens,
        })
        .rpc();

      toast.success(`Deposited ${amount} USDC`, {
        action: {
          label: "Explorer",
          onClick: () =>
            window.open(explorerUrl(tx)),
        },
      });
    } catch (e: unknown) {
      const err = e as Error;
      toast.error("Deposit failed", { description: err.message });
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Liquidity Pools</h1>
        <p className="text-gray-400 mt-1">
          Deposit USDC to earn premiums. Receive LP tokens representing your
          share.
        </p>
      </div>

      {loading && (
        <div className="text-gray-400">Loading pools from chain...</div>
      )}

      {!loading && pools.length === 0 && (
        <div className="border border-gray-800 rounded-xl p-8 text-center text-gray-400">
          No active pools found. Connect wallet and initialize a pool.
        </div>
      )}

      <div className="space-y-4">
        {pools.map((p: any) => {
          const acc = p.account;
          const totalLiquidity = acc.totalLiquidity.toNumber() / 1_000_000;
          const totalLocked = acc.totalLocked.toNumber() / 1_000_000;
          const utilization =
            totalLiquidity > 0
              ? ((totalLocked / totalLiquidity) * 100).toFixed(1)
              : "0.0";
          const premiumAccrued = acc.premiumAccrued.toNumber() / 1_000_000;
          const available = totalLiquidity - totalLocked;
          const apy =
            available > 0
              ? ((premiumAccrued / available) * 365 * 100).toFixed(1)
              : "0.0";

          return (
            <div
              key={p.publicKey.toBase58()}
              className="border border-gray-800 rounded-xl p-6 space-y-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-white">
                    Pool #{acc.poolType} —{" "}
                    {["Flight", "Crop Drought", "Crop Flood", "DeFi Hack"][
                      acc.poolType
                    ] || "Unknown"}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {p.publicKey.toBase58().slice(0, 8)}...
                  </div>
                </div>
                <div
                  className={`px-2 py-1 rounded text-xs ${
                    acc.isActive
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-gray-700 text-gray-400"
                  }`}
                >
                  {acc.isActive ? "Active" : "Inactive"}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-400">TVL</div>
                  <div className="text-white font-medium">
                    ${totalLiquidity.toLocaleString()} USDC
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Utilization</div>
                  <div className="text-white font-medium">{utilization}%</div>
                </div>
                <div>
                  <div className="text-gray-400">Est. APY</div>
                  <div className="text-emerald-400 font-medium">{apy}%</div>
                </div>
                <div>
                  <div className="text-gray-400">Active Policies</div>
                  <div className="text-white font-medium">
                    {acc.activePolicyCount.toNumber()}
                  </div>
                </div>
              </div>

              {/* Deposit */}
              <div className="flex gap-3">
                <input
                  type="number"
                  placeholder="USDC amount"
                  value={depositAmounts[p.publicKey.toBase58()] || ""}
                  onChange={(e) =>
                    setDepositAmounts((prev) => ({
                      ...prev,
                      [p.publicKey.toBase58()]: e.target.value,
                    }))
                  }
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                />
                <button
                  onClick={() => handleDeposit(p.publicKey.toBase58())}
                  disabled={!wallet || submitting === p.publicKey.toBase58()}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  {submitting === p.publicKey.toBase58()
                    ? "Depositing..."
                    : "Deposit"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
