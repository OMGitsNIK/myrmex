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

  const [queuedAt, setQueuedAt] = useState<number | null>(null);

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
      const [pendingPayoutPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pending_payout"), policyPk.toBuffer()],
        PROGRAM_ID
      );

      // Queue payout — USDC does not move yet; a 48-hour verification delay starts.
      // After the delay, anyone can call finalize_payout from the Governance Dashboard.
      const tx = await (program as any).methods
        .queuePayout()
        .accounts({
          caller: wallet.publicKey,
          policy: policyPk,
          pool: poolPk,
          poolConfig: poolConfigPda,
          oracleReport: oracleReportPda,
          policyholder: wallet.publicKey,
          pendingPayout: pendingPayoutPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      setClaimTx(tx);
      setQueuedAt(Math.floor(Date.now() / 1000));
      toast.success("Claim queued — payout releases after 48-hour verification");
      setPolicyInfo((prev) =>
        prev ? { ...prev, isClaimed: true, isActive: false } : prev
      );
    } catch (e: unknown) {
      const err = e as Error;
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
      } else if (err.message.includes("already in use") || err.message.includes("0x0")) {
        toast.info("Claim already queued — check the Governance Dashboard for payout status");
        setClaimTx("already-queued");
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
          If your trigger condition is met, queue a claim. USDC is released
          after a 48-hour verification window to prevent oracle manipulation.
        </p>
      </div>

      {/* How it works */}
      <div className="card p-5 space-y-2 text-sm text-gray-400">
        <p className="text-white font-semibold text-sm">How claims work</p>
        <p>
          The oracle service monitors real-world events and posts signed data on-chain.
          When your trigger condition is met, submitting a claim queues a payout with a
          48-hour verification window — protecting against oracle manipulation before
          USDC is released.
        </p>
        <div className="flex gap-6 pt-1 text-xs flex-wrap">
          <span>
            <span className="text-[var(--accent)]">1.</span> Oracle posts data on-chain
          </span>
          <span>
            <span className="text-[var(--accent)]">2.</span> You queue the claim here
          </span>
          <span>
            <span className="text-[var(--accent)]">3.</span> 48h verification window
          </span>
          <span>
            <span className="text-[var(--accent)]">4.</span> USDC released automatically
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
            ? "Queuing claim..."
            : policyInfo.isClaimed
            ? "Already Claimed"
            : !policyInfo.isActive
            ? "Policy Expired"
            : !wallet
            ? "Connect Wallet"
            : wallet.publicKey.toBase58() !== policyInfo.policyholder
            ? "Not Your Policy"
            : `Queue Claim — $${policyInfo.payoutAmount.toLocaleString()} USDC`}
        </button>
      )}

      {/* Success — queued */}
      {claimTx && claimTx !== "already-queued" && (
        <div className="card p-6 border-blue-400/30 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-blue-400 font-semibold text-sm">
              Claim Queued — 48-Hour Verification Starts Now
            </span>
          </div>
          <p className="text-sm text-gray-400">
            Your payout of{" "}
            <span className="text-white font-medium">
              ${policyInfo?.payoutAmount.toLocaleString()} USDC
            </span>{" "}
            is locked and waiting. After the 48-hour window, it can be finalized
            from the{" "}
            <a href="/admin" className="text-[var(--accent)] underline">
              Governance Dashboard
            </a>
            . This delay protects against oracle manipulation.
          </p>
          {queuedAt && (
            <div className="text-xs text-gray-500">
              Finalization available after:{" "}
              <span className="text-white">
                {new Date((queuedAt + 172800) * 1000).toLocaleString()}
              </span>
            </div>
          )}
          <a
            href={explorerUrl(claimTx)}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm border border-blue-400/40 text-blue-400 px-4 py-2 rounded-lg hover:border-blue-400 transition-colors"
          >
            View Transaction →
          </a>
        </div>
      )}

      {claimTx === "already-queued" && (
        <div className="card p-6 border-yellow-500/30 space-y-2">
          <p className="text-yellow-400 font-semibold text-sm">Already In Queue</p>
          <p className="text-sm text-gray-400">
            This claim is already queued. Visit the{" "}
            <a href="/admin" className="text-[var(--accent)] underline">
              Governance Dashboard
            </a>{" "}
            to check its status and finalize when the delay expires.
          </p>
        </div>
      )}
    </div>
  );
}
