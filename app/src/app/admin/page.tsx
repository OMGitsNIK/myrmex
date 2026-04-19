"use client";

import { API_URL } from "@/lib/constants";
import { useEffect, useState } from "react";

interface StatsResponse {
  total_tvl_usdc: number;
  active_policies: number;
  total_pools: number;
  payouts_executed?: number;
  total_events?: number;
}

interface PoolResponse {
  pubkey: string;
  poolType: number;
  totalLiquidity: number;
  totalLocked: number;
  available: number;
  utilizationPct: string;
  estimatedApy: string;
  activePolicies: number;
  isActive: boolean;
}

const POOL_TYPE_LABELS: Record<number, string> = {
  0: "Flight Delay",
  1: "Crop Drought",
  2: "Crop Flood",
  3: "DeFi Hack",
  4: "Stablecoin Depeg",
  5: "Hurricane",
  6: "Hospitalization",
};

function lamportsToUsdc(value: number) {
  return value / 1_000_000;
}

function formatUsdc(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy public key"
      className={`transition-colors ${
        copied ? "text-[var(--accent)]" : "text-gray-500 hover:text-[var(--accent)]"
      }`}
    >
      {copied ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

export default function AdminPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [pools, setPools] = useState<PoolResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      try {
        const [statsRes, poolsRes] = await Promise.all([
          fetch(`${API_URL}/api/stats`),
          fetch(`${API_URL}/api/pools`),
        ]);

        if (!statsRes.ok || !poolsRes.ok) {
          throw new Error("Failed to load protocol metrics");
        }

        const [statsData, poolsData] = (await Promise.all([
          statsRes.json(),
          poolsRes.json(),
        ])) as [StatsResponse, PoolResponse[]];

        if (cancelled) return;

        setStats(statsData);
        setPools(poolsData);
        setError(null);
        setLastUpdated(new Date());
      } catch (e: unknown) {
        if (cancelled) return;
        const err = e as Error;
        setError(err.message || "Failed to load protocol metrics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load(true);
    const interval = setInterval(() => load(false), 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const totalTvl = lamportsToUsdc(stats?.total_tvl_usdc ?? 0);
  const avgPoolUtilization =
    pools.length > 0
      ? pools.reduce((sum, p) => sum + parseFloat(p.utilizationPct), 0) / pools.length
      : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Protocol Admin</h1>
          <p className="text-gray-400 mt-2">
            Live protocol-wide health metrics, pool breakdowns, and payout activity.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {lastUpdated ? `Auto-refreshing every 15s • Updated ${lastUpdated.toLocaleTimeString()}` : "Loading live metrics..."}
        </div>
      </div>

      {error && (
        <div className="card p-4 text-sm text-red-400 border-red-500/30">
          Failed to load admin metrics: {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total TVL"
          value={`$${formatUsdc(totalTvl)}`}
          detail="USDC across all live pools"
          loading={loading}
        />
        <StatCard
          label="Active Policies"
          value={`${stats?.active_policies ?? 0}`}
          detail="Policies currently backed by pool liquidity"
          loading={loading}
        />
        <StatCard
          label="Total Pools"
          value={`${stats?.total_pools ?? 0}`}
          detail="Pools discovered from on-chain state"
          loading={loading}
        />
        <StatCard
          label="Avg Pool Utilization"
          value={`${avgPoolUtilization.toFixed(1)}%`}
          detail="Average locked/liquidity ratio across all pools"
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--border)] px-6 py-4">
            <h2 className="font-semibold text-white">Pool Breakdown</h2>
            <p className="mt-1 text-sm text-gray-400">
              Live liquidity and policy distribution by pool.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-2)]/40 text-xs uppercase tracking-widest text-gray-500">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Pool Type</th>
                  <th className="px-6 py-3 text-left font-medium">TVL (USDC)</th>
                  <th className="px-6 py-3 text-left font-medium">Active Policies</th>
                  <th className="px-6 py-3 text-left font-medium">Pool Address</th>
                </tr>
              </thead>
              <tbody>
                {loading && pools.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                      Loading pools...
                    </td>
                  </tr>
                )}

                {!loading && pools.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                      No pools returned by the API.
                    </td>
                  </tr>
                )}

                {pools.map((pool) => (
                  <tr key={pool.pubkey} className="border-t border-[var(--border)]">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">
                        {POOL_TYPE_LABELS[pool.poolType] || `Type ${pool.poolType}`}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Utilization {pool.utilizationPct}% • {pool.isActive ? "Active" : "Inactive"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-white font-medium">
                      ${formatUsdc(lamportsToUsdc(pool.totalLiquidity))}
                    </td>
                    <td className="px-6 py-4 text-white">{pool.activePolicies}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-mono">
                          {pool.pubkey.slice(0, 14)}...{pool.pubkey.slice(-6)}
                        </span>
                        <CopyButton value={pool.pubkey} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-white">Payout History</h2>
              <p className="mt-1 text-sm text-gray-400">
                Indexed payout activity from the REST API stats endpoint.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <MiniMetric
                label="Payouts Executed"
                value={`${stats?.payouts_executed ?? 0}`}
                loading={loading}
              />
              <MiniMetric
                label="Indexed Events"
                value={`${stats?.total_events ?? 0}`}
                loading={loading}
              />
            </div>
          </div>

          <div className="card p-6 space-y-3 text-sm text-gray-400">
            <p>
              This page is read-only and does not require a wallet. It pulls from{" "}
              <code className="text-[var(--accent)]">/api/stats</code> and{" "}
              <code className="text-[var(--accent)]">/api/pools</code> using the configured API base URL.
            </p>
            <p>
              TVL values are displayed in USDC by converting on-chain token amounts from 6-decimal base units.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  loading,
}: {
  label: string;
  value: string;
  detail: string;
  loading: boolean;
}) {
  return (
    <div className="card p-6">
      <div className="text-xs uppercase tracking-widest text-gray-500">{label}</div>
      <div className="mt-3 text-3xl font-bold text-white tracking-tight">
        {loading ? "..." : value}
      </div>
      <div className="mt-2 text-sm text-gray-400">{detail}</div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-4">
      <div className="text-xs uppercase tracking-widest text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{loading ? "..." : value}</div>
    </div>
  );
}
