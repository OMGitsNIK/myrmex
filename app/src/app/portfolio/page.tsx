"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { usePolicies, PolicyData } from "@/hooks/usePolicies";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { COVERAGE_NAMES, COVERAGE_TYPES, USDC_DECIMALS } from "@/lib/constants";

// ── helpers ──────────────────────────────────────────────────────────────────

type PolicyStatus = "active" | "claimed" | "expired";

function getPolicyStatus(acc: PolicyData["account"]): PolicyStatus {
  if (acc.isClaimed) return "claimed";
  const isExpired = new Date(acc.expiresAt * 1000) < new Date();
  if (!acc.isActive || isExpired) return "expired";
  return "active";
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy public key"
      className={`transition-colors ${copied ? "text-[var(--accent)]" : "text-gray-500 hover:text-[var(--accent)]"}`}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

// ── PolicyCard ────────────────────────────────────────────────────────────────

function PolicyCard({ p }: { p: PolicyData }) {
  const acc = p.account;
  const payout = acc.payoutAmount / USDC_DECIMALS;
  const premium = acc.premiumAmount / USDC_DECIMALS;
  const expiresAt = new Date(acc.expiresAt * 1000);
  const pubkey = p.pubkey;

  const statusType = getPolicyStatus(acc);
  const isActive = statusType === "active";

  const status =
    statusType === "claimed"
      ? { label: "Claimed", color: "bg-blue-500/20 text-blue-400" }
      : statusType === "expired"
      ? { label: "Expired", color: "bg-gray-700 text-gray-400" }
      : { label: "● Active", color: "bg-[var(--accent-dim)] text-[var(--accent)]" };

  const tc = acc.triggerCondition;

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
          <div className={`font-medium ${statusType === "expired" ? "text-gray-500" : "text-white"}`}>
            {expiresAt.toLocaleDateString()}
          </div>
        </div>
      </div>

      {isActive && (
        <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
          <span className="text-xs text-gray-500">Trigger a payout or file a claim</span>
          <div className="flex gap-2">
            <Link
              href={`/claim?policy=${pubkey}`}
              className="text-xs border border-[var(--accent)]/40 text-[var(--accent)] px-3 py-1.5 rounded hover:border-[var(--accent)] transition-colors"
            >
              File a Claim →
            </Link>
            <Link
              href={`/simulate?policy=${pubkey}`}
              className="text-xs border border-[var(--border)] text-gray-400 px-3 py-1.5 rounded hover:border-gray-500 transition-colors"
            >
              Simulate →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CollapsibleCategory ───────────────────────────────────────────────────────

interface CollapsibleCategoryProps {
  type: number;
  policies: PolicyData[];
  isOpen: boolean;
  onToggle: (type: number) => void;
  /** The active status filter — used to build contextual empty-state copy */
  statusFilter: PolicyStatus | "all";
}

function CollapsibleCategory({
  type,
  policies,
  isOpen,
  onToggle,
  statusFilter,
}: CollapsibleCategoryProps) {
  const activeCount = useMemo(
    () => policies.filter((p) => getPolicyStatus(p.account) === "active").length,
    [policies]
  );
  const claimedCount = useMemo(
    () => policies.filter((p) => getPolicyStatus(p.account) === "claimed").length,
    [policies]
  );
  const expiredCount = useMemo(
    () => policies.filter((p) => getPolicyStatus(p.account) === "expired").length,
    [policies]
  );

  const categoryName = COVERAGE_NAMES[type] ?? `Type ${type}`;

  // Contextual empty state: only shown when expanded and no policies pass the filter
  const emptyLabel = useMemo(() => {
    if (policies.length > 0) return null;
    if (statusFilter === "all") return `No ${categoryName} policies.`;
    return `No ${statusFilter} ${categoryName.toLowerCase()} policies.`;
  }, [policies.length, statusFilter, categoryName]);

  return (
    <div className="space-y-2">
      {/* Category header — always rendered */}
      <button
        id={`category-${type}`}
        onClick={() => onToggle(type)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 text-left group bg-[var(--surface)] p-3 rounded-lg border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-white group-hover:text-[var(--accent)] transition-colors">
            {categoryName}
          </h2>
          <span className="text-xs text-gray-500 bg-[var(--surface-2)] px-2 py-0.5 rounded-full">
            {policies.length} {policies.length === 1 ? "policy" : "policies"}
          </span>
          {activeCount > 0 && (
            <span className="text-xs bg-[var(--accent-dim)] text-[var(--accent)] px-2 py-0.5 rounded-full">
              {activeCount} active
            </span>
          )}
          {claimedCount > 0 && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
              {claimedCount} claimed
            </span>
          )}
          {expiredCount > 0 && (
            <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
              {expiredCount} expired
            </span>
          )}
        </div>
        <span
          className="text-gray-500 text-xs shrink-0 pl-2 transition-transform duration-200"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden
        >
          ▼
        </span>
      </button>

      {/* Expandable content */}
      {isOpen && (
        <div className="space-y-3 pt-1 pl-1">
          {policies.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">{emptyLabel}</p>
          ) : (
            policies.map((p) => <PolicyCard key={p.pubkey} p={p} />)
          )}
        </div>
      )}
    </div>
  );
}

// ── PolicySkeleton ─────────────────────────────────────────────────────────

function PolicySkeleton() {
  return (
    <div className="card p-6 space-y-4 animate-pulse">
      <div className="flex justify-between">
        <div className="h-3 w-36 bg-[var(--surface-2)] rounded" />
        <div className="h-5 w-16 bg-[var(--surface-2)] rounded" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-1">
            <div className="h-2 w-12 bg-[var(--surface-2)] rounded" />
            <div className="h-4 w-20 bg-[var(--surface-2)] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── StatusChip ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: PolicyStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "claimed", label: "Claimed" },
  { value: "expired", label: "Expired" },
];

function StatusChip({
  option,
  selected,
  onClick,
}: {
  option: (typeof STATUS_OPTIONS)[number];
  selected: boolean;
  onClick: () => void;
}) {
  const colors: Record<string, string> = {
    all: selected
      ? "bg-white/10 text-white border-white/30"
      : "text-gray-400 border-[var(--border)] hover:border-gray-500",
    active: selected
      ? "bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--accent)]/50"
      : "text-gray-400 border-[var(--border)] hover:border-[var(--accent)]/40",
    claimed: selected
      ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
      : "text-gray-400 border-[var(--border)] hover:border-blue-500/30",
    expired: selected
      ? "bg-gray-700 text-gray-300 border-gray-600"
      : "text-gray-400 border-[var(--border)] hover:border-gray-600",
  };

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${colors[option.value]}`}
    >
      {option.label}
    </button>
  );
}

// ── PortfolioPage ─────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const wallet = useAnchorWallet();
  const { policies, loading, error } = usePolicies();

  const [statusFilter, setStatusFilter] = useState<PolicyStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Track which category sections are open. Keyed by coverage type number.
  // undefined = use defaultOpen; true/false = explicit user choice.
  const [openOverrides, setOpenOverrides] = useState<Record<number, boolean>>({});

  // ── derived counts (from raw unfiltered policies) ──
  const totalActiveCount = useMemo(
    () => policies.filter((p) => getPolicyStatus(p.account) === "active").length,
    [policies]
  );
  const totalClaimedCount = useMemo(
    () => policies.filter((p) => getPolicyStatus(p.account) === "claimed").length,
    [policies]
  );
  const totalExpiredCount = useMemo(
    () => policies.filter((p) => getPolicyStatus(p.account) === "expired").length,
    [policies]
  );

  // ── available coverage categories (from raw policies, for the category dropdown) ──
  const availableTypes = useMemo(() => {
    const types = new Set(policies.map((p) => p.account.coverageType));
    return Array.from(types).sort((a, b) => a - b);
  }, [policies]);

  // ── filtered policies ──
  const filteredPolicies = useMemo(() => {
    return policies.filter((p) => {
      if (statusFilter !== "all" && getPolicyStatus(p.account) !== statusFilter) return false;
      if (categoryFilter !== "all" && p.account.coverageType !== categoryFilter) return false;
      if (searchQuery && !p.pubkey.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [policies, statusFilter, categoryFilter, searchQuery]);

  // ── group filtered policies by coverage type ──
  const grouped = useMemo(() => {
    return filteredPolicies.reduce<Record<number, PolicyData[]>>((acc, p) => {
      const type = p.account.coverageType;
      if (!acc[type]) acc[type] = [];
      acc[type].push(p);
      return acc;
    }, {});
  }, [filteredPolicies]);

  // When a category filter is active, show all matching types even if they have 0 policies after sub-filtering
  const sortedTypes = useMemo(() => {
    // Start from all types present in the grouped result
    const typesInResult = Object.keys(grouped).map(Number);

    // If a category filter is active and there are no results, still show that category
    if (categoryFilter !== "all" && !typesInResult.includes(categoryFilter as number)) {
      typesInResult.push(categoryFilter as number);
    }
    return typesInResult.sort((a, b) => a - b);
  }, [grouped, categoryFilter]);

  // defaultOpen: expand if total policies are ≤ 5 or if there is only 1 category
  const defaultOpen = policies.length <= 5 || availableTypes.length <= 1;

  const isOpen = useCallback(
    (type: number) =>
      openOverrides[type] !== undefined ? openOverrides[type] : defaultOpen,
    [openOverrides, defaultOpen]
  );

  const handleToggle = useCallback(
    (type: number) => {
      setOpenOverrides((prev) => {
        const current = prev[type] !== undefined ? prev[type] : defaultOpen;
        return { ...prev, [type]: !current };
      });
    },
    [defaultOpen]
  );

  const expandAll = useCallback(() => {
    const overrides: Record<number, boolean> = {};
    availableTypes.forEach((t) => (overrides[t] = true));
    setOpenOverrides(overrides);
  }, [availableTypes]);

  const collapseAll = useCallback(() => {
    const overrides: Record<number, boolean> = {};
    availableTypes.forEach((t) => (overrides[t] = false));
    setOpenOverrides(overrides);
  }, [availableTypes]);

  const clearFilters = () => {
    setStatusFilter("all");
    setCategoryFilter("all");
    setSearchQuery("");
  };

  const hasActiveFilters =
    statusFilter !== "all" || categoryFilter !== "all" || searchQuery !== "";

  // ── wallet-gate ───────────────────────────────────────────────────────────
  if (!wallet) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-gray-400">Connect your wallet to view your policies.</p>
        <Link
          href="/buy"
          className="inline-block text-sm border border-[var(--accent)]/40 text-[var(--accent)] px-5 py-2 rounded-lg hover:border-[var(--accent)] transition-colors"
        >
          Browse coverage →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">My Portfolio</h1>
          <p className="text-gray-400 mt-1">Your active and historical policies.</p>
        </div>
        {/* Summary pills */}
        {!loading && policies.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {totalActiveCount > 0 && (
              <span className="text-xs bg-[var(--accent-dim)] text-[var(--accent)] px-3 py-1 rounded-full font-medium">
                {totalActiveCount} active
              </span>
            )}
            {totalClaimedCount > 0 && (
              <span className="text-xs bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full font-medium">
                {totalClaimedCount} claimed
              </span>
            )}
            {totalExpiredCount > 0 && (
              <span className="text-xs bg-gray-700 text-gray-400 px-3 py-1 rounded-full font-medium">
                {totalExpiredCount} expired
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Filter bar — shown only when there are policies ── */}
      {!loading && !error && policies.length > 0 && (
        <div className="card bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-4">
          {/* Status chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 font-medium mr-1 shrink-0">Status:</span>
            {STATUS_OPTIONS.map((opt) => (
              <StatusChip
                key={opt.value}
                option={opt}
                selected={statusFilter === opt.value}
                onClick={() => setStatusFilter(opt.value)}
              />
            ))}
          </div>

          {/* Category dropdown + search in one row */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-gray-500 font-medium">Category</label>
              <select
                id="portfolio-category-filter"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2 text-sm text-white focus:outline-none focus:border-[var(--accent)] transition-colors"
                value={categoryFilter === "all" ? "all" : categoryFilter.toString()}
                onChange={(e) =>
                  setCategoryFilter(e.target.value === "all" ? "all" : Number(e.target.value))
                }
              >
                <option value="all">All Categories</option>
                {availableTypes.map((id) => (
                  <option key={id} value={id.toString()}>
                    {COVERAGE_NAMES[id] ?? `Type ${id}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-[2] space-y-1">
              <label className="text-xs text-gray-500 font-medium">Search by pubkey</label>
              <div className="relative">
                <input
                  id="portfolio-search"
                  type="text"
                  placeholder="Paste or type a policy address…"
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2 pl-8 text-sm text-white focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-gray-600"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {/* search icon */}
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <div className="flex justify-end">
              <button
                onClick={clearFilters}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Expand / Collapse all — shown when there are ≥ 2 categories ── */}
      {!loading && !error && availableTypes.length >= 2 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {sortedTypes.length} {sortedTypes.length === 1 ? "category" : "categories"}
          </span>
          <div className="flex gap-3">
            <button
              onClick={expandAll}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Expand all
            </button>
            <span className="text-gray-700">·</span>
            <button
              onClick={collapseAll}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Collapse all
            </button>
          </div>
        </div>
      )}

      {/* ── Loading state ── */}
      {loading && (
        <div className="space-y-3">
          <PolicySkeleton />
          <PolicySkeleton />
        </div>
      )}

      {/* ── Error state ── */}
      {error && (
        <div className="card p-4 text-sm text-red-400 border-red-500/30">
          Failed to load policies: {error}
        </div>
      )}

      {/* ── Empty wallet state ── */}
      {!loading && !error && policies.length === 0 && (
        <div className="card p-12 text-center space-y-4">
          <div className="text-4xl">🛡</div>
          <div className="text-white font-semibold text-lg">No policies yet</div>
          <p className="text-gray-400 text-sm max-w-xs mx-auto">
            Buy parametric coverage and get paid automatically when real-world events are confirmed
            by oracles.
          </p>
          <Link
            href="/buy"
            className="inline-block bg-[var(--accent)] hover:opacity-90 text-black font-bold px-6 py-2.5 rounded-lg transition-opacity text-sm mt-2"
          >
            Buy Your First Policy →
          </Link>
        </div>
      )}

      {/* ── Global empty-filtered state (all categories filtered away) ── */}
      {!loading && !error && policies.length > 0 && sortedTypes.length === 0 && (
        <div className="card p-8 text-center space-y-2">
          <div className="text-gray-400">No policies match the selected filters.</div>
          <button onClick={clearFilters} className="text-[var(--accent)] text-sm hover:underline">
            Clear filters
          </button>
        </div>
      )}

      {/* ── Category sections ── */}
      {!loading && !error && sortedTypes.length > 0 && (
        <div className="space-y-4">
          {sortedTypes.map((type) => (
            <CollapsibleCategory
              key={type}
              type={type}
              policies={grouped[type] ?? []}
              isOpen={isOpen(type)}
              onToggle={handleToggle}
              statusFilter={statusFilter}
            />
          ))}
        </div>
      )}

      {/* ── Footer CTA ── */}
      {!loading && policies.length > 0 && (
        <div className="text-center pt-4 border-t border-[var(--border)] mt-8">
          <Link href="/buy" className="text-sm text-[var(--accent)] hover:underline inline-block mt-4">
            + Buy more coverage
          </Link>
        </div>
      )}
    </div>
  );
}
