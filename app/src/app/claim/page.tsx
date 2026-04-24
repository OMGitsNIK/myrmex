"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAnchorProgram } from "@/hooks/useAnchorProgram";
import {
  API_URL,
  explorerUrl,
  COVERAGE_NAMES,
  COMPARISON_LABELS,
  PROGRAM_ID,
  USDC_DECIMALS,
} from "@/lib/constants";
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";

interface PolicyInfo {
  pubkey: string;
  coverageType: number;
  threshold: number;
  comparison: number;
  scopeHash: number[];
  isActive: boolean;
  isClaimed: boolean;
  payoutAmount: number;
  pool: string;
  policyholder: string;
}

export default function ClaimPage() {
  const { program, wallet } = useAnchorProgram();
  const searchParams = useSearchParams();
  const [policyPubkey, setPolicyPubkey] = useState(
    () => searchParams.get("policy") ?? ""
  );
  const [policyInfo, setPolicyInfo] = useState<PolicyInfo | null>(null);
  const [fetchingPolicy, setFetchingPolicy] = useState(false);
  const [oracleStatus, setOracleStatus] = useState<{
    reported_value: number | null;
    reported_at: number | null;
    is_fresh: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [claimTx, setClaimTx] = useState<string | null>(null);

  // Auto-fetch policy info on pubkey input
  useEffect(() => {
    const trimmed = policyPubkey.trim();
    if (trimmed.length < 32) {
      setPolicyInfo(null);
      setOracleStatus(null);
      return;
    }

    const timer = setTimeout(async () => {
      setFetchingPolicy(true);
      try {
        const res = await fetch(`${API_URL}/api/policy/${trimmed}`);
        if (!res.ok) {
          setPolicyInfo(null);
          return;
        }
        const data = await res.json();
        const tc = data.account.triggerCondition;
        setPolicyInfo({
          pubkey: trimmed,
          coverageType: data.account.coverageType,
          threshold: tc.threshold,
          comparison: tc.comparison,
          scopeHash: tc.scopeHash,
          isActive: data.account.isActive,
          isClaimed: data.account.isClaimed,
          payoutAmount: data.account.payoutAmount / USDC_DECIMALS,
          pool: data.account.pool,
          policyholder: data.account.policyholder,
        });

        // Also check oracle report freshness
        const oracleRes = await fetch(
          `${API_URL}/api/oracle-report/${
            data.account.pool
          }?scope_hash=${tc.scopeHash
            .map((b: number) => b.toString(16).padStart(2, "0"))
            .join("")}`
        ).catch(() => null);
        if (oracleRes?.ok) {
          const oracleData = await oracleRes.json();
          setOracleStatus(oracleData);
        } else {
          setOracleStatus(null);
        }
      } catch {
        setPolicyInfo(null);
      } finally {
        setFetchingPolicy(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [policyPubkey]);

  const handleClaim = async () => {
    if (!program || !wallet || !policyInfo) {
      toast.error("Connect wallet and load a policy first");
      return;
    }
    if (!policyInfo.isActive || policyInfo.isClaimed) {
      toast.error("Policy is not active or already claimed");
      return;
    }
    if (wallet.publicKey.toBase58() !== policyInfo.policyholder) {
      toast.error("Only the policyholder can claim");
      return;
    }

    setSubmitting(true);
    setClaimTx(null);

    try {
      const policyPk = new PublicKey(policyInfo.pubkey);
      const poolPk = new PublicKey(policyInfo.pool);

      const [poolConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool_config"), poolPk.toBuffer()],
        PROGRAM_ID
      );
      const [oracleReportPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("oracle_report"),
          poolPk.toBuffer(),
          Buffer.from(policyInfo.scopeHash),
        ],
        PROGRAM_ID
      );

      // Fetch pool to get vault + usdcMint
      const poolsRes = await fetch(`${API_URL}/api/pools`);
      const pools = (await poolsRes.json()) as any[];
      const pool = pools.find((p: any) => p.pubkey === policyInfo.pool);
      if (!pool) throw new Error("Pool not found");

      const usdcMint = new PublicKey(
        process.env.NEXT_PUBLIC_USDC_MINT || pool.usdcMint || ""
      );
      const policyholderUsdc = getAssociatedTokenAddressSync(
        usdcMint,
        wallet.publicKey
      );

      const tx = await (program as any).methods
        .triggerPayout()
        .accounts({
          caller: wallet.publicKey,
          policy: policyPk,
          pool: poolPk,
          poolConfig: poolConfigPda,
          oracleReport: oracleReportPda,
          policyholderUsdc,
          poolVault: new PublicKey(pool.vault),
          policyholder: wallet.publicKey,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      setClaimTx(tx);
      toast.success("Payout claimed successfully!");
      setPolicyInfo((prev) =>
        prev ? { ...prev, isClaimed: true, isActive: false } : prev
      );
    } catch (e: unknown) {
      const err = e as Error;
      // Parse on-chain error for better UX
      if (err.message.includes("TriggerNotMet")) {
        toast.error("Trigger condition not met", {
          description:
            "The oracle report does not satisfy your policy's trigger condition.",
        });
      } else if (err.message.includes("OracleReportStale")) {
        toast.error("Oracle report is stale", {
          description:
            "No fresh oracle data found. The oracle service posts reports every 5 minutes.",
        });
      } else {
        toast.error("Claim failed", { description: err.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const triggerLabel = policyInfo
    ? `oracle value ${COMPARISON_LABELS[policyInfo.comparison] ?? "?"} ${
        policyInfo.threshold
      }`
    : null;

  const canClaim =
    policyInfo?.isActive &&
    !policyInfo?.isClaimed &&
    wallet?.publicKey.toBase58() === policyInfo?.policyholder;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Claim Payout
        </h1>
        <p className="text-gray-400 mt-2">
          If your trigger condition is met, call the smart contract to receive
          your payout instantly.
        </p>
      </div>

      {/* How it works */}
      <div className="card p-5 space-y-2 text-sm text-gray-400">
        <p className="text-white font-semibold text-sm">How claims work</p>
        <p>
          The oracle service monitors real-world events and posts signed data to
          the blockchain. When conditions are met, anyone can trigger the payout
          — USDC always goes to the policyholder.
        </p>
        <div className="flex gap-6 pt-1 text-xs">
          <span>
            <span className="text-[var(--accent)]">1.</span> Oracle posts data
            on-chain
          </span>
          <span>
            <span className="text-[var(--accent)]">2.</span> Smart contract
            verifies condition
          </span>
          <span>
            <span className="text-[var(--accent)]">3.</span> USDC sent instantly
          </span>
        </div>
      </div>

      {/* Policy lookup */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-white text-sm uppercase tracking-widest">
          Policy
        </h2>

        <label className="block space-y-1">
          <span className="text-xs text-gray-500">Policy Public Key</span>
          <input
            value={policyPubkey}
            onChange={(e) => {
              setPolicyPubkey(e.target.value);
              setClaimTx(null);
            }}
            placeholder="Paste your policy pubkey from Portfolio..."
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-[var(--accent)]/50 outline-none transition-colors"
          />
        </label>

        {fetchingPolicy && (
          <p className="text-xs text-gray-500 animate-pulse">
            Loading policy...
          </p>
        )}

        {policyInfo && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] divide-y divide-[var(--border)]">
            <div className="px-4 py-3 flex justify-between text-sm">
              <span className="text-gray-400">Coverage Type</span>
              <span className="text-white">
                {COVERAGE_NAMES[policyInfo.coverageType] ??
                  `Type ${policyInfo.coverageType}`}
              </span>
            </div>
            <div className="px-4 py-3 flex justify-between text-sm">
              <span className="text-gray-400">Trigger Condition</span>
              <span className="text-white font-mono">{triggerLabel}</span>
            </div>
            <div className="px-4 py-3 flex justify-between text-sm">
              <span className="text-gray-400">Payout Amount</span>
              <span className="text-[var(--accent)] font-bold">
                ${policyInfo.payoutAmount.toLocaleString()} USDC
              </span>
            </div>
            <div className="px-4 py-3 flex justify-between text-sm">
              <span className="text-gray-400">Status</span>
              <span
                className={
                  policyInfo.isClaimed
                    ? "text-gray-500"
                    : policyInfo.isActive
                    ? "text-[var(--accent)]"
                    : "text-red-400"
                }
              >
                {policyInfo.isClaimed
                  ? "Claimed"
                  : policyInfo.isActive
                  ? "Active"
                  : "Expired"}
              </span>
            </div>
            {wallet &&
              wallet.publicKey.toBase58() !== policyInfo.policyholder && (
                <div className="px-4 py-3 text-xs text-yellow-400">
                  ⚠ Your wallet is not the policyholder for this policy.
                </div>
              )}
          </div>
        )}
      </div>

      {/* Oracle report status */}
      {policyInfo && (
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold text-white text-sm uppercase tracking-widest">
            Oracle Status
          </h2>
          {oracleStatus ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Reported Value</span>
                <span className="text-white font-mono">
                  {oracleStatus.reported_value?.toLocaleString() ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Posted At</span>
                <span className="text-white">
                  {oracleStatus.reported_at
                    ? new Date(oracleStatus.reported_at * 1000).toLocaleString()
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Freshness</span>
                <span
                  className={
                    oracleStatus.is_fresh
                      ? "text-[var(--accent)]"
                      : "text-red-400"
                  }
                >
                  {oracleStatus.is_fresh ? "✓ Fresh (valid)" : "⚠ Stale"}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No oracle report found for this pool yet. The oracle service posts
              reports every 5 minutes.
            </p>
          )}
        </div>
      )}

      {/* Claim button */}
      {policyInfo && !claimTx && (
        <button
          onClick={handleClaim}
          disabled={submitting || !canClaim}
          className="w-full bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3.5 rounded-lg transition-opacity text-sm tracking-wide shadow-[0_0_20px_rgba(0,255,135,0.2)]"
        >
          {submitting
            ? "Submitting claim..."
            : policyInfo.isClaimed
            ? "Already Claimed"
            : !policyInfo.isActive
            ? "Policy Expired"
            : !wallet
            ? "Connect Wallet"
            : wallet.publicKey.toBase58() !== policyInfo.policyholder
            ? "Not Your Policy"
            : `Claim $${policyInfo.payoutAmount.toLocaleString()} USDC`}
        </button>
      )}

      {/* Success */}
      {claimTx && (
        <div className="card p-6 border-[var(--accent)]/30 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
            <span className="text-[var(--accent)] font-semibold text-sm">
              Payout Received
            </span>
          </div>
          <p className="text-sm text-gray-400">
            USDC has been transferred to your wallet.
          </p>
          <a
            href={explorerUrl(claimTx)}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm border border-[var(--accent)]/40 text-[var(--accent)] px-4 py-2 rounded-lg hover:border-[var(--accent)] transition-colors"
          >
            View Transaction →
          </a>
        </div>
      )}
    </div>
  );
}
