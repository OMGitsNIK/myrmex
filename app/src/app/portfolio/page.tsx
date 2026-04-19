"use client";

import { useState } from "react";
import { usePolicies } from "@/hooks/usePolicies";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

const COVERAGE_NAMES: Record<number, string> = {
  0: "Flight Delay ✈",
  1: "Crop Drought 🌾",
  2: "Crop Flood 🌊",
  3: "DeFi Hack 🛡",
  4: "Stablecoin Depeg",
  5: "Hurricane 🌀",
  6: "Hospitalization 🏥",
};

const COMPARISON_LABELS: Record<number, string> = {
  0: ">",
  1: "<",
  2: "==",
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy public key"
      className={`transition-colors ${copied ? "text-[var(--accent)]" : "text-gray-500 hover:text-[var(--accent)]"}`}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
    </button>
  );
}

export default function PortfolioPage() {
  const wallet = useAnchorWallet();
  const { policies, loading } = usePolicies();

  if (!wallet) {
    return (
      <div className="text-center py-20 text-gray-400">
        Connect your wallet to view your policies.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">My Portfolio</h1>
        <p className="text-gray-400 mt-2">Your active and historical policies.</p>
      </div>

      {loading && (
        <div className="text-gray-400 text-sm">Loading policies from chain...</div>
      )}

      {!loading && policies.length === 0 && (
        <div className="card p-8 text-center text-gray-400">
          No policies found. Buy your first policy to get started.
        </div>
      )}

      <div className="space-y-4">
        {policies.map((p: any) => {
          const acc = p.account;
          const payout = acc.payoutAmount.toNumber() / 1_000_000;
          const premium = acc.premiumAmount.toNumber() / 1_000_000;
          const expiresAt = new Date(acc.expiresAt.toNumber() * 1000);
          const isExpired = expiresAt < new Date();
          const pubkey = p.publicKey.toBase58();

          const status = acc.isClaimed
            ? { label: "Claimed", color: "bg-blue-500/20 text-blue-400" }
            : !acc.isActive || isExpired
            ? { label: "Expired", color: "bg-gray-700 text-gray-400" }
            : { label: "● Active", color: "bg-[var(--accent-dim)] text-[var(--accent)]" };

          const tc = acc.triggerCondition;
          const compLabel = COMPARISON_LABELS[tc.comparison] || "?";

          return (
            <div key={pubkey} className="card card-hover p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="font-semibold text-white">
                    {COVERAGE_NAMES[acc.coverageType] || `Type ${acc.coverageType}`}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-mono">
                      {pubkey.slice(0, 14)}...{pubkey.slice(-6)}
                    </span>
                    <CopyButton value={pubkey} />
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${status.color}`}>
                  {status.label}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 text-xs mb-1">Payout</div>
                  <div className="text-[var(--accent)] font-bold">${payout.toLocaleString()} USDC</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Premium Paid</div>
                  <div className="text-white font-medium">${premium.toFixed(2)} USDC</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Trigger</div>
                  <div className="text-white font-mono">value {compLabel} {tc.threshold.toNumber()}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Expires</div>
                  <div className="text-white font-medium">{expiresAt.toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
