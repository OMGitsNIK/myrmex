"use client";

import { useState } from "react";
import { usePolicies, PolicyData } from "@/hooks/usePolicies";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { COVERAGE_NAMES, COMPARISON_LABELS, USDC_DECIMALS } from "@/lib/constants";

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

function PolicyCard({ p }: { p: PolicyData }) {
  const acc = p.account;
  const payout = acc.payoutAmount / USDC_DECIMALS;
  const premium = acc.premiumAmount / USDC_DECIMALS;
  const expiresAt = new Date(acc.expiresAt * 1000);
  const isExpired = expiresAt < new Date();
  const pubkey = p.pubkey;

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
          <div className="text-white font-mono">value {compLabel} {tc.threshold}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs mb-1">Expires</div>
          <div className="text-white font-medium">{expiresAt.toLocaleDateString()}</div>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const wallet = useAnchorWallet();
  const { policies, loading, error } = usePolicies();

  if (!wallet) {
    return (
      <div className="text-center py-20 text-gray-400">
        Connect your wallet to view your policies.
      </div>
    );
  }

  // Group policies by coverageType
  const grouped = policies.reduce<Record<number, PolicyData[]>>((acc, p) => {
    const type = p.account.coverageType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(p);
    return acc;
  }, {});

  const sortedTypes = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">My Portfolio</h1>
        <p className="text-gray-400 mt-2">Your active and historical policies.</p>
      </div>

      {loading && (
        <div className="text-gray-400 text-sm">Loading policies from chain...</div>
      )}

      {error && (
        <div className="card p-4 text-sm text-red-400 border-red-500/30">
          Failed to load policies: {error}
        </div>
      )}

      {!loading && !error && policies.length === 0 && (
        <div className="card p-8 text-center text-gray-400">
          No policies found. Buy your first policy to get started.
        </div>
      )}

      {sortedTypes.map((type) => (
        <div key={type} className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">
              {COVERAGE_NAMES[type] || `Type ${type}`}
            </h2>
            <span className="text-xs text-gray-500 bg-[var(--surface-2)] px-2 py-0.5 rounded-full">
              {grouped[type].length} {grouped[type].length === 1 ? "policy" : "policies"}
            </span>
          </div>
          <div className="space-y-3">
            {grouped[type].map((p) => (
              <PolicyCard key={p.pubkey} p={p} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
