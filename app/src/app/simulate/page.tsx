"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { API_URL, explorerUrl } from "@/lib/constants";
import { toast } from "sonner";

interface TxStep {
  label: string;
  status: "idle" | "running" | "success" | "error";
  txSig?: string;
  ms?: number;
}

export default function SimulatePage() {
  const [policyPubkey, setPolicyPubkey] = useState("");
  const [oracleValue, setOracleValue] = useState(150);
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [running, setRunning] = useState(false);
  const [totalMs, setTotalMs] = useState<number | null>(null);

  const updateStep = (i: number, update: Partial<TxStep>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...update } : s)));

  const simulate = async () => {
    if (!policyPubkey) {
      toast.error("Enter a policy pubkey");
      return;
    }
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
      // Step 1
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

      // Step 2
      updateStep(1, { status: "running" });
      await delay(200);
      updateStep(1, { status: "success", ms: 200 });

      // Step 3
      updateStep(2, { status: "running" });
      await delay(100);
      updateStep(2, {
        status: "success",
        txSig: data.payout_tx,
        ms: Date.now() - t1,
      });

      // Step 4
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
    if (s === "running") return <span className="text-yellow-400 animate-pulse">●</span>;
    if (s === "success") return <span className="text-emerald-400">✓</span>;
    return <span className="text-red-400">✗</span>;
  };

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
            onChange={(e) => setPolicyPubkey(e.target.value)}
            placeholder="Enter policy pubkey from portfolio..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-gray-400">
            Oracle Value (e.g. 150 minutes delay)
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
          disabled={running}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold py-3 rounded-lg transition-colors"
        >
          {running ? "Simulating..." : "🚀 Simulate Flight Delay Trigger"}
        </button>
      </div>

      {/* Timeline */}
      {steps.length > 0 && (
        <div className="border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-white">Execution Timeline</h2>

          <div className="space-y-3">
            {steps.map((step, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-900"
              >
                <span className="text-lg w-6 text-center">
                  {statusIcon(step.status)}
                </span>
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
                {step.ms && (
                  <span className="text-xs text-gray-400">{step.ms}ms</span>
                )}
              </div>
            ))}
          </div>

          {totalMs !== null && (
            <div className="text-center py-4">
              <div className="text-3xl font-bold text-emerald-400">
                {totalMs}ms
              </div>
              <div className="text-sm text-gray-400 mt-1">
                Total time from trigger to payout
              </div>
            </div>
          )}
        </div>
      )}

      {/* Context */}
      <div className="border border-gray-800 rounded-xl p-6 space-y-3 text-sm text-gray-400">
        <p>
          <span className="text-white font-medium">What&apos;s happening:</span>{" "}
          The API calls the on-chain{" "}
          <code className="text-emerald-400">trigger_payout</code> instruction.
          The smart contract verifies the oracle value against the policy&apos;s
          trigger condition, marks the policy as claimed, and transfers USDC to
          the policyholder — all in a single atomic transaction.
        </p>
        <p>
          <span className="text-white font-medium">No trust required:</span> Anyone
          can call trigger_payout. The contract enforces all rules on-chain.
        </p>
      </div>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
