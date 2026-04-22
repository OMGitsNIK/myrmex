"use client";

import { useState } from "react";
import Link from "next/link";
import { usePolicies, PolicyData } from "@/hooks/usePolicies";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { COVERAGE_NAMES, COVERAGE_TYPES, USDC_DECIMALS } from "@/lib/constants";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
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
  const isActive = acc.isActive && !acc.isClaimed && !isExpired;

  const status = acc.isClaimed
    ? { label: "Claimed", color: "bg-blue-500/20 text-blue-400" }
    : !acc.isActive || isExpired
    ? { label: "Expired", color: "bg-gray-700 text-gray-400" }
    : { label: "● Active", color: "bg-[var(--accent-dim)] text-[var(--accent)]" };

  const tc = acc.triggerCondition;
  const compLabel = COMPARISON_LABELS[tc.comparison] || "?";

  return (
    <div className="card card-hover p-6 space-y-4">
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
          <div className="text-white font-mono text-xs">
            {(() => {
              const ct = COVERAGE_TYPES.find((t) => t.id === acc.coverageType);
              return ct ? ct.thresholdDisplay(tc.threshold) : `value ${tc.threshold}`;
            })()}
          </div>
        </div>
        <div>
          <div className="text-gray-500 text-xs mb-1">Expires</div>
          <div className={`font-medium ${isExpired ? "text-gray-500" : "text-white"}`}>
            {expiresAt.toLocaleDateString()}
          </div>
        </div>
      </div>

      {isActive && (
        <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
          <span className="text-xs text-gray-500">Demo a payout trigger</span>
          <Link
            href={`/simulate?policy=${pubkey}`}
            className="text-xs border border-[var(--accent)]/40 text-[var(--accent)] px-3 py-1.5 rounded hover:border-[var(--accent)] transition-colors"
          >
            Simulate Trigger →
          </Link>
        </div>
      )}
    </div>
  );
}

function CollapsibleCategory({ type, policies }: { type: number; policies: PolicyData[] }) {
  const [open, setOpen] = useState(true);
  const activeCount = policies.filter(
    (p) => p.account.isActive && !p.account.isClaimed && new Date(p.account.expiresAt * 1000) > new Date()
  ).length;
  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left group"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white group-hover:text-[var(--accent)] transition-colors">
            {COVERAGE_NAMES[type] || `Type ${type}`}
          </h2>
          <span className="text-xs text-gray-500 bg-[var(--surface-2)] px-2 py-0.5 rounded-full">
            {policies.length} {policies.length === 1 ? "policy" : "policies"}
          </span>
          {activeCount > 0 && (
            <span className="text-xs bg-[var(--accent-dim)] text-[var(--accent)] px-2 py-0.5 rounded-full">
              {activeCount} active
            </span>
          )}
        </div>
        <span className="text-gray-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-3">
          {policies.map((p) => (
            <PolicyCard key={p.pubkey} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function PolicySkeleton() {
  return (
    <div className="card p-6 space-y-4 animate-pulse">
      <div className="flex justify-between">
        <div className="h-3 w-36 bg-[var(--surface-2)] rounded" />
        <div className="h-5 w-16 bg-[var(--surface-2)] rounded" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[0,1,2,3].map((i) => (
          <div key={i} className="space-y-1">
            <div className="h-2 w-12 bg-[var(--surface-2)] rounded" />
            <div className="h-4 w-20 bg-[var(--surface-2)] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const wallet = useAnchorWallet();
  const { policies, loading, error } = usePolicies();

  if (!wallet) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-gray-400">Connect your wallet to view your policies.</p>
        <Link href="/buy" className="inline-block text-sm border border-[var(--accent)]/40 text-[var(--accent)] px-5 py-2 rounded-lg hover:border-[var(--accent)] transition-colors">
          Browse coverage →
        </Link>
      </div>
    );
  }

  const grouped = policies.reduce<Record<number, PolicyData[]>>((acc, p) => {
    const type = p.account.coverageType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(p);
    return acc;
  }, {});

  const sortedTypes = Object.keys(grouped).map(Number).sort((a, b) => a - b);
  const activeCount = policies.filter(p => p.account.isActive && !p.account.isClaimed && new Date(p.account.expiresAt * 1000) > new Date()).length;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">My Portfolio</h1>
          <p className="text-gray-400 mt-2">Your active and historical policies.</p>
        </div>
        {activeCount > 0 && (
          <div className="text-right">
            <div className="text-[var(--accent)] font-bold text-xl">{activeCount}</div>
            <div className="text-xs text-gray-500">active {activeCount === 1 ? "policy" : "policies"}</div>
          </div>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          <PolicySkeleton />
          <PolicySkeleton />
        </div>
      )}

      {error && (
        <div className="card p-4 text-sm text-red-400 border-red-500/30">
          Failed to load policies: {error}
        </div>
      )}

      {!loading && !error && policies.length === 0 && (
        <div className="card p-12 text-center space-y-4">
          <div className="text-4xl">🛡</div>
          <div className="text-white font-semibold text-lg">No policies yet</div>
          <p className="text-gray-400 text-sm max-w-xs mx-auto">
            Buy parametric coverage and get paid automatically when real-world events are confirmed by oracles.
          </p>
          <Link
            href="/buy"
            className="inline-block bg-[var(--accent)] hover:opacity-90 text-black font-bold px-6 py-2.5 rounded-lg transition-opacity text-sm mt-2"
          >
            Buy Your First Policy →
          </Link>
        </div>
      )}

      {sortedTypes.map((type) => (
        <CollapsibleCategory key={type} type={type} policies={grouped[type]} />
      ))}

      {!loading && policies.length > 0 && (
        <div className="text-center pt-4 border-t border-[var(--border)]">
          <Link href="/buy" className="text-sm text-[var(--accent)] hover:underline">
            + Buy more coverage
          </Link>
        </div>
      )}
    </div>
  );
}
