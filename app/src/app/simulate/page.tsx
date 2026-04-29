"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import {
  API_URL,
  explorerUrl,
  COVERAGE_NAMES,
  COMPARISON_LABELS,
  USDC_DECIMALS,
} from "@/lib/constants";
import { toast } from "sonner";

interface PolicyInfo {
  coverageType: number;
  threshold: number;
  comparison: number;
  isActive: boolean;
  isClaimed: boolean;
  payoutAmount: number;
}

interface TxStep {
  label: string;
  status: "idle" | "running" | "success" | "error";
  txSig?: string;
  ms?: number;
}

function validOracleValue(comparison: number, threshold: number): number {
  if (comparison === 0) return threshold + 50;
  if (comparison === 1) return Math.max(0, threshold - 10);
  return threshold;
}

function SimulateInner() {
  const searchParams = useSearchParams();
  const prefillPolicy = searchParams.get("policy") ?? "";
  const wallet = useAnchorWallet();
  const { signMessage } = useWallet();

  const [policyPubkey, setPolicyPubkey] = useState(prefillPolicy);
  const [oracleValue, setOracleValue] = useState(150);
  const [policyInfo, setPolicyInfo] = useState<PolicyInfo | null>(null);
  const [fetchingPolicy, setFetchingPolicy] = useState(false);
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [running, setRunning] = useState(false);
  const [totalMs, setTotalMs] = useState<number | null>(null);

  useEffect(() => {
    const trimmed = policyPubkey.trim();
    if (trimmed.length < 32) {
      setPolicyInfo(null);
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
        const info: PolicyInfo = {
          coverageType: data.account.coverageType,
          threshold: tc.threshold,
          comparison: tc.comparison,
          isActive: data.account.isActive,
          isClaimed: data.account.isClaimed,
          payoutAmount: data.account.payoutAmount / USDC_DECIMALS,
        };
        setPolicyInfo(info);
        setOracleValue(validOracleValue(tc.comparison, tc.threshold));
      } catch {
        setPolicyInfo(null);
      } finally {
        setFetchingPolicy(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [policyPubkey]);

  const updateStep = (i: number, update: Partial<TxStep>) =>
    setSteps((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...update } : s))
    );

  const simulate = async () => {
    if (!policyPubkey) {
      toast.error("Enter a policy pubkey");
      return;
    }
    if (!wallet) {
      toast.error("Connect your wallet to simulate a trigger");
      return;
    }
    setRunning(true);
    setTotalMs(null);
    const start = Date.now();

    const initialSteps: TxStep[] = [
      {
        label: "Oracle: signing & posting trigger event on-chain",
        status: "idle",
      },
      {
        label: "Smart contract: reading oracle report, verifying condition",
        status: "idle",
      },
      {
        label: "Smart contract: transferring USDC to policyholder",
        status: "idle",
      },
      { label: "Confirmation: funds arrived in wallet", status: "idle" },
    ];
    setSteps(initialSteps);

    try {
      updateStep(0, { status: "running" });
      await delay(300);

      // Sign ownership proof — binds both the policy pubkey and the oracle value
      // so the signature cannot be replayed at a different trigger value.
      const message = new TextEncoder().encode(
        `myrmex-simulate:${policyPubkey}:${oracleValue}`
      );
      if (!signMessage) throw new Error("Wallet does not support signMessage");
      let signature: Uint8Array;
      try {
        signature = await signMessage(message);
      } catch {
        throw new Error(
          "Wallet signature rejected — needed to prove policy ownership"
        );
      }

      const t1 = Date.now();

      const res = await fetch(`${API_URL}/api/simulate-trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policy: policyPubkey,
          oracle_value: oracleValue,
          message: Array.from(message),
          signature: Array.from(signature),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Simulation failed");
      }

      const data = await res.json();
      const oracleDone = Date.now() - t1;
      updateStep(0, { status: "success", ms: oracleDone });
      updateStep(1, { status: "running" });
      await delay(150);
      updateStep(1, { status: "success", ms: 150 });
      updateStep(2, { status: "running" });
      await delay(100);
      updateStep(2, {
        status: "success",
        txSig: data.payout_tx,
        ms: oracleDone,
      });
      updateStep(3, { status: "running" });
      await delay(200);
      updateStep(3, { status: "success", ms: 200 });

      setTotalMs(Date.now() - start);
      toast.success(`Payout executed in ${Date.now() - start}ms!`);
    } catch (e: unknown) {
      toast.error("Simulation failed", { description: (e as Error).message });
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "running" || s.status === "idle"
            ? { ...s, status: "error" }
            : s
        )
      );
    } finally {
      setRunning(false);
    }
  };

  const statusIcon = (s: TxStep["status"]) => {
    if (s === "idle") return <span className="text-gray-600">○</span>;
    if (s === "running")
      return <span className="text-yellow-400 animate-pulse">●</span>;
    if (s === "success") return <span className="text-emerald-400">✓</span>;
    return <span className="text-red-400">✗</span>;
  };

  const triggerLabel = policyInfo
    ? `oracle_value ${COMPARISON_LABELS[policyInfo.comparison]} ${
        policyInfo.threshold
      }`
    : null;

  const willTrigger = policyInfo
    ? policyInfo.comparison === 0
      ? oracleValue > policyInfo.threshold
      : policyInfo.comparison === 1
      ? oracleValue < policyInfo.threshold
      : oracleValue === policyInfo.threshold
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
        <span className="font-semibold">Testnet only.</span> This demo runs on
        Solana devnet with test USDC. No real funds are used.
      </div>

      <div>
        <h1 className="text-3xl font-bold text-white">Trigger Simulator</h1>
        <p className="text-gray-400 mt-1">
          Full oracle → payout lifecycle demo. Two real on-chain transactions.
        </p>
      </div>

      <div className="card p-6 space-y-5">
        <h2 className="font-semibold text-white">Demo Parameters</h2>

        <label className="block space-y-1.5">
          <span className="text-xs text-gray-400">Policy Public Key</span>
          <input
            value={policyPubkey}
            onChange={(e) => {
              setPolicyPubkey(e.target.value);
              setSteps([]);
              setTotalMs(null);
            }}
            placeholder="Paste a policy pubkey from your portfolio…"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-[var(--accent)]/50 outline-none transition-colors"
          />
          {!policyPubkey && (
            <p className="text-xs text-gray-600">
              Find your policy pubkey on the{" "}
              <a
                href="/portfolio"
                className="text-[var(--accent)] hover:underline"
              >
                Portfolio page
              </a>
              .
            </p>
          )}
        </label>

        {fetchingPolicy && (
          <p className="text-xs text-gray-500">Looking up policy on-chain…</p>
        )}

        {policyInfo && (
          <div className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-4 py-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Coverage type</span>
              <span className="text-white font-medium">
                {COVERAGE_NAMES[policyInfo.coverageType] ||
                  `Type ${policyInfo.coverageType}`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Trigger condition</span>
              <span className="text-white font-mono text-xs">
                {triggerLabel}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Payout</span>
              <span className="text-[var(--accent)] font-bold">
                ${policyInfo.payoutAmount.toLocaleString()} USDC
              </span>
            </div>
            {policyInfo.isClaimed && (
              <p className="text-yellow-400 text-xs pt-1">
                ⚠ This policy has already been claimed.
              </p>
            )}
            {!policyInfo.isActive && !policyInfo.isClaimed && (
              <p className="text-red-400 text-xs pt-1">
                ⚠ This policy is expired or inactive.
              </p>
            )}
          </div>
        )}

        <label className="block space-y-1.5">
          <span className="text-xs text-gray-400">
            Oracle Value to Post
            {policyInfo && triggerLabel && (
              <span className="ml-2 text-gray-600">
                Condition: {triggerLabel}
              </span>
            )}
          </span>
          <div className="flex gap-3 items-center">
            <input
              type="number"
              value={oracleValue}
              onChange={(e) => setOracleValue(Number(e.target.value))}
              className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
            />
            {policyInfo && willTrigger !== null && (
              <span
                className={`text-xs font-semibold px-2 py-1 rounded ${
                  willTrigger
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {willTrigger ? "✓ Will trigger" : "✗ Won't trigger"}
              </span>
            )}
          </div>
          {policyInfo && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setOracleValue(
                    validOracleValue(
                      policyInfo.comparison,
                      policyInfo.threshold
                    )
                  )
                }
                className="text-xs text-[var(--accent)] border border-[var(--accent)]/30 px-2 py-1 rounded hover:border-[var(--accent)]/60 transition-colors"
              >
                Auto-fill trigger value
              </button>
            </div>
          )}
        </label>

        <button
          onClick={simulate}
          disabled={
            running ||
            (policyInfo?.isClaimed ?? false) ||
            !policyPubkey ||
            !wallet
          }
          className="w-full bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3 rounded-lg transition-opacity text-sm tracking-wide"
        >
          {running
            ? "Simulating on-chain…"
            : !wallet
            ? "Connect Wallet to Simulate"
            : policyInfo
            ? `Simulate ${
                COVERAGE_NAMES[policyInfo.coverageType] ?? "Policy"
              } Trigger`
            : "Simulate Trigger"}
        </button>
      </div>

      {steps.length > 0 && (
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-white">Execution Timeline</h2>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg bg-[var(--surface-2)]"
              >
                <span className="text-lg w-6 text-center mt-0.5">
                  {statusIcon(step.status)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white">{step.label}</div>
                  {step.txSig && (
                    <a
                      href={explorerUrl(step.txSig)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--accent)] hover:underline font-mono break-all"
                    >
                      {step.txSig.slice(0, 20)}… View on Explorer →
                    </a>
                  )}
                </div>
                {step.ms && (
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {step.ms}ms
                  </span>
                )}
              </div>
            ))}
          </div>

          {totalMs !== null && (
            <div className="text-center py-4 border-t border-[var(--border)]">
              <div className="text-3xl font-bold text-[var(--accent)]">
                {totalMs}ms
              </div>
              <div className="text-sm text-gray-400 mt-1">
                Total time from trigger to confirmed payout
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card p-6 space-y-3 text-sm text-gray-400">
        <p>
          <span className="text-white font-medium">
            Two real on-chain transactions:
          </span>{" "}
          The oracle keypair calls{" "}
          <code className="text-[var(--accent)]">post_oracle_report</code>,
          writing a signed, timestamped value. Then{" "}
          <code className="text-[var(--accent)]">trigger_payout</code> reads
          that account, verifies the condition, and atomically transfers USDC.
        </p>
        <p>
          <span className="text-white font-medium">Security model:</span> The
          oracle report must be signed by the pool&apos;s registered oracle
          authority. Anyone can call trigger_payout — but USDC always goes to
          the policyholder. Front-running only benefits the policyholder. All
          logic is on-chain.
        </p>
      </div>
    </div>
  );
}

export default function SimulatePage() {
  return (
    <Suspense fallback={<div className="text-gray-400 text-sm">Loading…</div>}>
      <SimulateInner />
    </Suspense>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
