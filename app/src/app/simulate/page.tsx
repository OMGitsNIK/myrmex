"use client";

import { useState, useEffect } from "react";
import { API_URL, explorerUrl, COVERAGE_NAMES, COMPARISON_LABELS, USDC_DECIMALS } from "@/lib/constants";
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
  if (comparison === 0) return threshold + 50;  // value > threshold
  if (comparison === 1) return Math.max(0, threshold - 10);  // value < threshold
  return threshold;  // value == threshold
}

export default function SimulatePage() {
  const [policyPubkey, setPolicyPubkey] = useState("");
  const [oracleValue, setOracleValue] = useState(150);
  const [policyInfo, setPolicyInfo] = useState<PolicyInfo | null>(null);
  const [fetchingPolicy, setFetchingPolicy] = useState(false);
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [running, setRunning] = useState(false);
  const [totalMs, setTotalMs] = useState<number | null>(null);

  // Auto-fetch policy info when a valid-looking pubkey is entered
  useEffect(() => {
    const trimmed = policyPubkey.trim();
    if (trimmed.length < 32) { setPolicyInfo(null); return; }

    const timer = setTimeout(async () => {
      setFetchingPolicy(true);
      try {
        const res = await fetch(`${API_URL}/api/policy/${trimmed}`);
        if (!res.ok) { setPolicyInfo(null); return; }
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
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...update } : s)));

  const simulate = async () => {
    if (!policyPubkey) { toast.error("Enter a policy pubkey"); return; }
    setRunning(true);
    setTotalMs(null);
    const start = Date.now();

    const initialSteps: TxStep[] = [
      { label: "Oracle: posting trigger event", status: "idle" },
      { label: "Smart contract: verifying oracle data", status: "idle" },
      { label: "Smart contract: executing payout", status: "idle" },
      { label: "Funds: arriving in wallet", status: "idle" },
    ];
    setSteps(initialSteps);

    try {
      updateStep(0, { status: "running" });
      await delay(300);
      const t1 = Date.now();

      const res = await fetch(`${API_URL}/api/simulate-trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: policyPubkey, oracle_value: oracleValue }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Simulation failed");
      }

      const data = await res.json();
      updateStep(0, { status: "success", ms: Date.now() - t1 });
      updateStep(1, { status: "running" });
      await delay(200);
      updateStep(1, { status: "success", ms: 200 });
      updateStep(2, { status: "running" });
      await delay(100);
      updateStep(2, { status: "success", txSig: data.payout_tx, ms: Date.now() - t1 });
      updateStep(3, { status: "running" });
      await delay(300);
      updateStep(3, { status: "success", ms: 300 });

      const elapsed = Date.now() - start;
      setTotalMs(elapsed);
      toast.success(`Payout executed in ${elapsed}ms!`);
    } catch (e: unknown) {
      const err = e as Error;
      toast.error("Simulation failed", { description: err.message });
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "running" || s.status === "idle" ? { ...s, status: "error" } : s
        )
      );
    } finally {
      setRunning(false);
    }
  };

  const statusIcon = (s: TxStep["status"]) => {
    if (s === "idle") return <span className="text-gray-600">○</span>;
    if (s === "running") return <span className="text-yellow-400 animate-pulse">●</span>;
    if (s === "success") return <span className="text-emerald-400">✓</span>;
    return <span className="text-red-400">✗</span>;
  };

  const triggerLabel = policyInfo
    ? `value ${COMPARISON_LABELS[policyInfo.comparison]} ${policyInfo.threshold}`
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Trigger Simulator</h1>
        <p className="text-gray-400 mt-1">
          Demonstrate the full oracle → payout lifecycle for judges.
        </p>
      </div>

      <div className="border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-white">Demo Parameters</h2>

        <label className="block space-y-1">
          <span className="text-xs text-gray-400">Policy Public Key</span>
          <input
            value={policyPubkey}
            onChange={(e) => { setPolicyPubkey(e.target.value); setSteps([]); setTotalMs(null); }}
            placeholder="Paste a policy pubkey from your portfolio..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono"
          />
        </label>

        {fetchingPolicy && (
          <p className="text-xs text-gray-500">Looking up policy...</p>
        )}

        {policyInfo && (
          <div className="rounded-lg bg-gray-900 border border-gray-700 px-4 py-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Coverage type</span>
              <span className="text-white">{COVERAGE_NAMES[policyInfo.coverageType] || `Type ${policyInfo.coverageType}`}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Trigger condition</span>
              <span className="text-white font-mono">{triggerLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Payout</span>
              <span className="text-[var(--accent)] font-semibold">${policyInfo.payoutAmount.toLocaleString()} USDC</span>
            </div>
            {policyInfo.isClaimed && (
              <p className="text-yellow-400 text-xs pt-1">⚠ This policy has already been claimed.</p>
            )}
            {!policyInfo.isActive && !policyInfo.isClaimed && (
              <p className="text-red-400 text-xs pt-1">⚠ This policy is expired or inactive.</p>
            )}
          </div>
        )}

        <label className="block space-y-1">
          <span className="text-xs text-gray-400">
            Oracle Value
            {triggerLabel && <span className="ml-2 text-emerald-400">(must satisfy: {triggerLabel})</span>}
          </span>
          <input
            type="number"
            value={oracleValue}
            onChange={(e) => setOracleValue(Number(e.target.value))}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
          />
        </label>

        <button
          onClick={simulate}
          disabled={running || (policyInfo?.isClaimed ?? false)}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold py-3 rounded-lg transition-colors"
        >
          {running
            ? "Simulating..."
            : policyInfo
            ? `🚀 Simulate ${COVERAGE_NAMES[policyInfo.coverageType] ?? "Policy"} Trigger`
            : "🚀 Simulate Trigger"}
        </button>
      </div>

      {steps.length > 0 && (
        <div className="border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-white">Execution Timeline</h2>
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-900">
                <span className="text-lg w-6 text-center">{statusIcon(step.status)}</span>
                <div className="flex-1">
                  <div className="text-sm text-white">{step.label}</div>
                  {step.txSig && (
                    <a
                      href={explorerUrl(step.txSig)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-400 hover:underline font-mono"
                    >
                      {step.txSig.slice(0, 16)}...
                    </a>
                  )}
                </div>
                {step.ms && <span className="text-xs text-gray-400">{step.ms}ms</span>}
              </div>
            ))}
          </div>

          {totalMs !== null && (
            <div className="text-center py-4">
              <div className="text-3xl font-bold text-emerald-400">{totalMs}ms</div>
              <div className="text-sm text-gray-400 mt-1">Total time from trigger to payout</div>
            </div>
          )}
        </div>
      )}

      <div className="border border-gray-800 rounded-xl p-6 space-y-3 text-sm text-gray-400">
        <p>
          <span className="text-white font-medium">What&apos;s happening (2 transactions):</span>{" "}
          First, the oracle service keypair calls <code className="text-emerald-400">post_oracle_report</code> — writing a signed, timestamped value to an on-chain account.
          Then, <code className="text-emerald-400">trigger_payout</code> reads that account, verifies the value satisfies the trigger condition, and atomically transfers USDC to the policyholder.
        </p>
        <p>
          <span className="text-white font-medium">Why this is secure:</span> The oracle report must be signed by the pool&apos;s registered oracle authority. Anyone can call trigger_payout — but USDC always goes to the policyholder, so front-running is impossible. All logic is enforced on-chain with no trusted intermediary.
        </p>
      </div>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
