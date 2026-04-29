"use client";

import { API_URL, COVERAGE_NAMES, USDC_DECIMALS } from "@/lib/constants";
import { useEffect, useState } from "react";
import { useAnchorProgram } from "@/hooks/useAnchorProgram";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";

interface StatsResponse {
  total_tvl_usdc: number;
  active_policies: number;
  total_pools: number;
  total_premium_accrued?: number;
  total_payouts_executed?: number;
  total_events?: number;
  last_sync_time?: string;
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

function lamportsToUsdc(value: number) {
  return value / USDC_DECIMALS;
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
        copied
          ? "text-[var(--accent)]"
          : "text-gray-500 hover:text-[var(--accent)]"
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
      ? pools.reduce((sum, p) => sum + parseFloat(p.utilizationPct), 0) /
        pools.length
      : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Protocol Admin
          </h1>
          <p className="text-gray-400 mt-2">
            Protocol metrics sourced from the API indexer. Values reflect
            on-chain state at last poll — not a real-time ledger.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          {lastUpdated
            ? `Auto-refreshing every 15s • Updated ${lastUpdated.toLocaleTimeString()}`
            : "Loading live metrics..."}
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
                  <th className="px-6 py-3 text-left font-medium">
                    TVL (USDC)
                  </th>
                  <th className="px-6 py-3 text-left font-medium">
                    Active Policies
                  </th>
                  <th className="px-6 py-3 text-left font-medium">
                    Pool Address
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && pools.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-8 text-center text-gray-400"
                    >
                      Loading pools...
                    </td>
                  </tr>
                )}

                {!loading && pools.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-8 text-center text-gray-400"
                    >
                      No pools returned by the API.
                    </td>
                  </tr>
                )}

                {pools.map((pool) => (
                  <tr
                    key={pool.pubkey}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">
                        {COVERAGE_NAMES[pool.poolType] ??
                          `Pool Type ${pool.poolType}`}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Utilization {pool.utilizationPct}% •{" "}
                        {pool.isActive ? "Active" : "Inactive"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-white font-medium">
                      ${formatUsdc(lamportsToUsdc(pool.totalLiquidity))}
                    </td>
                    <td className="px-6 py-4 text-white">
                      {pool.activePolicies}
                    </td>
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
              Metrics sourced from{" "}
              <code className="text-[var(--accent)]">/api/stats</code> and{" "}
              <code className="text-[var(--accent)]">/api/pools</code>. Values
              reflect on-chain state at last poll.
            </p>
            <p>
              <span className="text-yellow-400 font-medium">Pricing note:</span>{" "}
              The actuarial quote is advisory. The on-chain floor (
              <code className="text-[var(--accent)]">min_premium_bps</code> in{" "}
              <code className="text-[var(--accent)]">pool_config</code>) is the
              only enforced minimum.
            </p>
          </div>
        </div>
      </div>

      {/* Pool Config Update Panel */}
      <UpdatePoolConfigPanel pools={pools} />

      {/* Oracle Authority Timelock Panels */}
      <ProposeOracleAuthorityPanel pools={pools} />
      <ApplyOracleAuthorityPanel pools={pools} />
    </div>
  );
}

function UpdatePoolConfigPanel({ pools }: { pools: PoolResponse[] }) {
  const { program, wallet } = useAnchorProgram();
  const PROGRAM_ID = new PublicKey(
    "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
  );

  const [selectedPool, setSelectedPool] = useState("");
  const [minPremiumBps, setMinPremiumBps] = useState("500");
  const [maxCoverageBps, setMaxCoverageBps] = useState("8000");
  const [submitting, setSubmitting] = useState(false);

  const handleUpdate = async () => {
    if (!program || !wallet) {
      toast.error("Connect pool authority wallet");
      return;
    }
    if (!selectedPool) {
      toast.error("Select a pool");
      return;
    }
    const minBps = parseInt(minPremiumBps);
    const maxBps = parseInt(maxCoverageBps);
    if (!isFinite(minBps) || minBps < 0 || minBps > 10000) {
      toast.error("min_premium_bps must be 0–10000");
      return;
    }
    if (!isFinite(maxBps) || maxBps < 1 || maxBps > 10000) {
      toast.error("max_coverage_bps must be 1–10000");
      return;
    }

    setSubmitting(true);
    try {
      const poolPk = new PublicKey(selectedPool);
      const [poolConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool_config"), poolPk.toBuffer()],
        PROGRAM_ID
      );
      const { BN } = await import("@coral-xyz/anchor");
      await (program as any).methods
        .updatePoolConfig(new BN(minBps), new BN(maxBps))
        .accounts({
          authority: wallet.publicKey,
          pool: poolPk,
          poolConfig: poolConfigPda,
        })
        .rpc();
      toast.success("pool_config updated on-chain");
    } catch (e: unknown) {
      toast.error("Update failed", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-white">Update Pool Config</h2>
        <p className="text-xs text-gray-500 mt-1">
          Adjust premium floor / coverage cap. Requires pool authority wallet.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-1">
          <span className="text-xs text-gray-500">Pool</span>
          <select
            value={selectedPool}
            onChange={(e) => setSelectedPool(e.target.value)}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm focus:border-[var(--accent)]/50 outline-none"
          >
            <option value="">— select pool —</option>
            {pools.map((p) => (
              <option key={p.pubkey} value={p.pubkey}>
                {COVERAGE_NAMES[p.poolType] ?? `Type ${p.poolType}`} —{" "}
                {p.pubkey.slice(0, 8)}…
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-gray-500">
            Min Premium bps (0–10000)
          </span>
          <input
            type="number"
            value={minPremiumBps}
            onChange={(e) => setMinPremiumBps(e.target.value)}
            min={0}
            max={10000}
            step={1}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm focus:border-[var(--accent)]/50 outline-none"
          />
          <span className="text-xs text-gray-600">
            {(parseInt(minPremiumBps) / 100 || 0).toFixed(2)}% of payout
          </span>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-gray-500">
            Max Coverage bps (1–10000)
          </span>
          <input
            type="number"
            value={maxCoverageBps}
            onChange={(e) => setMaxCoverageBps(e.target.value)}
            min={1}
            max={10000}
            step={1}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm focus:border-[var(--accent)]/50 outline-none"
          />
          <span className="text-xs text-gray-600">
            {(parseInt(maxCoverageBps) / 100 || 0).toFixed(2)}% of pool TVL
          </span>
        </label>
      </div>
      <button
        onClick={handleUpdate}
        disabled={submitting || !wallet}
        className="bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 text-black font-bold px-6 py-2 rounded-lg text-sm transition-opacity"
      >
        {submitting ? "Updating…" : "Update Pool Config"}
      </button>
      {!wallet && (
        <p className="text-xs text-gray-600">
          Connect the pool authority wallet to update config.
        </p>
      )}
    </div>
  );
}

function ProposeOracleAuthorityPanel({ pools }: { pools: PoolResponse[] }) {
  const { program, wallet } = useAnchorProgram();
  const PROGRAM_ID = new PublicKey(
    "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
  );

  const [selectedPool, setSelectedPool] = useState("");
  const [newOracle, setNewOracle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handlePropose = async () => {
    if (!program || !wallet) {
      toast.error("Connect pool authority wallet");
      return;
    }
    if (!selectedPool) {
      toast.error("Select a pool");
      return;
    }
    let oraclePk: PublicKey;
    try {
      oraclePk = new PublicKey(newOracle);
    } catch {
      toast.error("Invalid oracle pubkey");
      return;
    }

    setSubmitting(true);
    try {
      const poolPk = new PublicKey(selectedPool);
      const [poolConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool_config"), poolPk.toBuffer()],
        PROGRAM_ID
      );
      const [proposalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("oracle_proposal"), poolPk.toBuffer()],
        PROGRAM_ID
      );
      await (program as any).methods
        .proposeOracleAuthority(oraclePk)
        .accounts({
          authority: wallet.publicKey,
          pool: poolPk,
          poolConfig: poolConfigPda,
          proposal: proposalPda,
          systemProgram: "11111111111111111111111111111111",
        })
        .rpc();
      toast.success(
        "Oracle authority change proposed — takes effect in 1 hour"
      );
    } catch (e: unknown) {
      toast.error("Proposal failed", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-white">
          Propose Oracle Authority Change
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Initiates a 1-hour timelock before the new oracle authority takes
          effect. Anyone can cancel by monitoring the proposal PDA.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-1">
          <span className="text-xs text-gray-500">Pool</span>
          <select
            value={selectedPool}
            onChange={(e) => setSelectedPool(e.target.value)}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm focus:border-[var(--accent)]/50 outline-none"
          >
            <option value="">— select pool —</option>
            {pools.map((p) => (
              <option key={p.pubkey} value={p.pubkey}>
                {COVERAGE_NAMES[p.poolType] ?? `Type ${p.poolType}`} —{" "}
                {p.pubkey.slice(0, 8)}…
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-gray-500">
            New Oracle Authority (pubkey)
          </span>
          <input
            type="text"
            value={newOracle}
            onChange={(e) => setNewOracle(e.target.value)}
            placeholder="GeBW6LUY…"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-[var(--accent)]/50 outline-none"
          />
        </label>
      </div>
      <button
        onClick={handlePropose}
        disabled={submitting || !wallet}
        className="bg-yellow-600 hover:opacity-90 disabled:opacity-40 text-black font-bold px-6 py-2 rounded-lg text-sm transition-opacity"
      >
        {submitting ? "Proposing…" : "Propose Oracle Change (1-hr timelock)"}
      </button>
      {!wallet && (
        <p className="text-xs text-gray-600">
          Connect the pool authority wallet to propose.
        </p>
      )}
    </div>
  );
}

function ApplyOracleAuthorityPanel({ pools }: { pools: PoolResponse[] }) {
  const { program, wallet } = useAnchorProgram();
  const PROGRAM_ID = new PublicKey(
    "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
  );

  const [selectedPool, setSelectedPool] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleApply = async () => {
    if (!program || !wallet) {
      toast.error("Connect pool authority wallet");
      return;
    }
    if (!selectedPool) {
      toast.error("Select a pool");
      return;
    }

    setSubmitting(true);
    try {
      const poolPk = new PublicKey(selectedPool);
      const [poolConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool_config"), poolPk.toBuffer()],
        PROGRAM_ID
      );
      const [proposalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("oracle_proposal"), poolPk.toBuffer()],
        PROGRAM_ID
      );
      await (program as any).methods
        .applyOracleAuthority()
        .accounts({
          authority: wallet.publicKey,
          pool: poolPk,
          poolConfig: poolConfigPda,
          proposal: proposalPda,
        })
        .rpc();
      toast.success("Oracle authority applied — proposal account closed");
    } catch (e: unknown) {
      toast.error("Apply failed", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-white">
          Apply Oracle Authority Change
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Applies a previously proposed oracle authority after the 1-hour
          timelock has expired.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-1">
          <span className="text-xs text-gray-500">Pool</span>
          <select
            value={selectedPool}
            onChange={(e) => setSelectedPool(e.target.value)}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm focus:border-[var(--accent)]/50 outline-none"
          >
            <option value="">— select pool —</option>
            {pools.map((p) => (
              <option key={p.pubkey} value={p.pubkey}>
                {COVERAGE_NAMES[p.poolType] ?? `Type ${p.poolType}`} —{" "}
                {p.pubkey.slice(0, 8)}…
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        onClick={handleApply}
        disabled={submitting || !wallet}
        className="bg-green-700 hover:opacity-90 disabled:opacity-40 text-white font-bold px-6 py-2 rounded-lg text-sm transition-opacity"
      >
        {submitting ? "Applying…" : "Apply Oracle Change (after timelock)"}
      </button>
      {!wallet && (
        <p className="text-xs text-gray-600">
          Connect the pool authority wallet to apply.
        </p>
      )}
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
      <div className="text-xs uppercase tracking-widest text-gray-500">
        {label}
      </div>
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
      <div className="text-xs uppercase tracking-widest text-gray-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {loading ? "..." : value}
      </div>
    </div>
  );
}
