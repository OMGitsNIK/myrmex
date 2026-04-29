"use client";

import { API_URL, COVERAGE_NAMES, USDC_DECIMALS } from "@/lib/constants";
import { useEffect, useState, useCallback } from "react";
import { useAnchorProgram } from "@/hooks/useAnchorProgram";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { toast } from "sonner";

const PROGRAM_ID = new PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

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

interface ProposalAccount {
  pubkey: string;
  id: number;
  proposer: string;
  title: string;
  votesFor: number;
  votesAgainst: number;
  votingEndsAt: number;
  executed: boolean;
  actionType: number;
  actionPayload: number[];
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

export default function GovernanceDashboardPage() {
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
            Governance Dashboard
          </h1>
          <p className="text-gray-400 mt-2">
            Protocol metrics and proposal execution. Passed proposals can be
            executed here after voting ends.
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
          Failed to load metrics: {error}
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
                value={`${stats?.total_payouts_executed ?? 0}`}
                loading={loading}
              />
              <MiniMetric
                label="Total Premium Accrued"
                value={`$${(
                  (stats?.total_premium_accrued ?? 0) / 1_000_000
                ).toFixed(2)}`}
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
              <span className="text-yellow-400 font-medium">Note:</span> Pool
              config changes and oracle authority updates are now managed through
              governance proposals. Create a proposal on the{" "}
              <a href="/governance" className="text-[var(--accent)] underline">
                Governance
              </a>{" "}
              page, vote, then execute it here.
            </p>
          </div>
        </div>
      </div>

      {/* Proposal Execution Panel */}
      <ExecuteProposalPanel pools={pools} />

      {/* Payout Queue Panel */}
      <PayoutQueuePanel />
    </div>
  );
}

const ACTION_TYPE_LABELS: Record<number, string> = {
  0: "Oracle Authority Change",
  1: "Pool Config Change",
};

function decodeActionPayload(actionType: number, payload: number[]): string {
  try {
    const buf = Buffer.from(payload);
    if (actionType === 0) {
      const newOracle = new PublicKey(buf.slice(0, 32)).toBase58();
      return `New oracle: ${newOracle.slice(0, 8)}…${newOracle.slice(-6)}`;
    }
    if (actionType === 1) {
      const pool = new PublicKey(buf.slice(0, 32)).toBase58();
      const minBps = buf.readBigUInt64LE(32);
      const maxBps = buf.readBigUInt64LE(40);
      return `Pool ${pool.slice(0, 8)}… min=${minBps}bps max=${maxBps}bps`;
    }
  } catch {
    /* ignore */
  }
  return "Unknown payload";
}

function ExecuteProposalPanel({ pools: _ }: { pools: PoolResponse[] }) {
  const { program, wallet, walletPublicKey } = useAnchorProgram();
  const [proposals, setProposals] = useState<ProposalAccount[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [executing, setExecuting] = useState<number | null>(null);

  const fetchProposals = useCallback(async () => {
    if (!program) return;
    setLoadingProposals(true);
    try {
      const accounts = await (program as any).account.governanceProposal.all();
      const now = Math.floor(Date.now() / 1000);
      const parsed: ProposalAccount[] = accounts
        .map((a: any) => ({
          pubkey: a.publicKey.toBase58(),
          id: Number(a.account.id),
          proposer: a.account.proposer.toBase58(),
          title: Buffer.from(a.account.title).toString("utf8").replace(/\0/g, "").trim(),
          votesFor: Number(a.account.votesFor),
          votesAgainst: Number(a.account.votesAgainst),
          votingEndsAt: Number(a.account.votingEndsAt),
          executed: a.account.executed,
          actionType: a.account.actionType,
          actionPayload: Array.from(a.account.actionPayload as Uint8Array),
        }))
        .filter(
          (p: ProposalAccount) =>
            !p.executed &&
            p.votingEndsAt <= now &&
            p.votesFor > p.votesAgainst
        );
      setProposals(parsed);
    } catch (e: unknown) {
      console.error("[governance] fetch proposals:", (e as Error).message);
    } finally {
      setLoadingProposals(false);
    }
  }, [program]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals, walletPublicKey]);

  const handleExecute = async (proposal: ProposalAccount) => {
    if (!program || !wallet) {
      toast.error("Connect your wallet to execute proposals");
      return;
    }

    // Decode pool pubkey from action payload
    let poolPk: PublicKey;
    try {
      const buf = Buffer.from(proposal.actionPayload);
      poolPk = new PublicKey(buf.slice(0, 32));
    } catch {
      toast.error("Cannot decode pool from proposal payload");
      return;
    }

    const [proposalPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("proposal"),
        Buffer.from(new Uint8Array(8)).map((_, i) => {
          const id = BigInt(proposal.id);
          return Number((id >> BigInt(i * 8)) & BigInt(0xff));
        }),
      ],
      PROGRAM_ID
    );

    const [poolConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool_config"), poolPk.toBuffer()],
      PROGRAM_ID
    );

    setExecuting(proposal.id);
    try {
      const { BN } = await import("@coral-xyz/anchor");
      const tx = await (program as any).methods
        .executeProposal(new BN(proposal.id))
        .accounts({
          executor: wallet.publicKey,
          proposal: proposalPda,
          pool: poolPk,
          poolConfig: poolConfigPda,
        })
        .rpc();
      toast.success(`Proposal #${proposal.id} executed`, {
        description: `Tx: ${tx.slice(0, 16)}…`,
      });
      setProposals((prev) => prev.filter((p) => p.id !== proposal.id));
    } catch (e: unknown) {
      toast.error("Execution failed", { description: (e as Error).message });
    } finally {
      setExecuting(null);
    }
  };

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">Execute Passed Proposals</h2>
          <p className="text-xs text-gray-500 mt-1">
            Proposals that passed community vote and whose voting period has
            ended. Anyone can execute them.
          </p>
        </div>
        <button
          onClick={fetchProposals}
          disabled={loadingProposals || !program}
          className="text-xs text-gray-500 hover:text-[var(--accent)] disabled:opacity-40 transition-colors"
        >
          {loadingProposals ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {!wallet && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
          Connect your wallet to load and execute proposals.
        </div>
      )}

      {wallet && !loadingProposals && proposals.length === 0 && (
        <div className="py-6 text-center text-sm text-gray-500">
          No passed proposals awaiting execution.
        </div>
      )}

      <div className="space-y-3">
        {proposals.map((proposal) => (
          <div
            key={proposal.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500">
                    #{proposal.id}
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {proposal.title}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {ACTION_TYPE_LABELS[proposal.actionType] ?? "Unknown action"}{" "}
                  — {decodeActionPayload(proposal.actionType, proposal.actionPayload)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-green-400 font-medium">
                  ✓ {proposal.votesFor} for
                </div>
                <div className="text-xs text-red-400">
                  ✗ {proposal.votesAgainst} against
                </div>
              </div>
            </div>

            <button
              onClick={() => handleExecute(proposal)}
              disabled={executing === proposal.id || !wallet}
              className="w-full bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 text-black font-bold px-4 py-2 rounded-lg text-sm transition-opacity"
            >
              {executing === proposal.id
                ? "Executing…"
                : `Execute Proposal #${proposal.id}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PendingPayoutAccount {
  pubkey: string;
  policy: string;
  pool: string;
  policyholder: string;
  amount: number;
  executeAfter: number;
  vetoed: boolean;
}

function timeUntil(ts: number): string {
  const diff = ts * 1000 - Date.now();
  if (diff <= 0) return "Ready";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`;
}

function PayoutQueuePanel() {
  const { program, wallet } = useAnchorProgram();
  const [payouts, setPayouts] = useState<PendingPayoutAccount[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const fetchPayouts = useCallback(async () => {
    if (!program) return;
    setLoadingPayouts(true);
    try {
      const accounts = await (program as any).account.pendingPayout.all();
      const parsed: PendingPayoutAccount[] = accounts.map((a: any) => ({
        pubkey: a.publicKey.toBase58(),
        policy: a.account.policy.toBase58(),
        pool: a.account.pool.toBase58(),
        policyholder: a.account.policyholder.toBase58(),
        amount: Number(a.account.amount),
        executeAfter: Number(a.account.executeAfter ?? a.account.execute_after),
        vetoed: a.account.vetoed,
      }));
      setPayouts(parsed);
    } catch (e: unknown) {
      console.error("[payout-queue] fetch:", (e as Error).message);
    } finally {
      setLoadingPayouts(false);
    }
  }, [program]);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  const handleFinalize = async (payout: PendingPayoutAccount) => {
    if (!program || !wallet) {
      toast.error("Connect wallet to finalize");
      return;
    }
    setActing(payout.pubkey);
    try {
      const poolPk = new PublicKey(payout.pool);
      const policyPk = new PublicKey(payout.policy);
      const policyholderPk = new PublicKey(payout.policyholder);

      const poolAccount = await (program as any).account.riskPool.fetch(poolPk);
      const poolVault = poolAccount.vault as PublicKey;
      const usdcMint = poolAccount.usdcMint as PublicKey;

      const [poolConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool_config"), poolPk.toBuffer()],
        PROGRAM_ID
      );
      const [pendingPayoutPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pending_payout"), policyPk.toBuffer()],
        PROGRAM_ID
      );
      const policyholderUsdc = getAssociatedTokenAddressSync(
        usdcMint,
        policyholderPk
      );

      await (program as any).methods
        .finalizePayout()
        .accounts({
          caller: wallet.publicKey,
          pendingPayout: pendingPayoutPda,
          policy: policyPk,
          pool: poolPk,
          poolConfig: poolConfigPda,
          policyholderUsdc,
          poolVault,
          reserveVault: null,
          policyholder: policyholderPk,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      toast.success("Payout finalized — USDC sent to policyholder");
      setPayouts((prev) => prev.filter((p) => p.pubkey !== payout.pubkey));
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("TimelockNotExpired")) {
        toast.error("48-hour delay has not passed yet");
      } else {
        toast.error("Finalize failed", { description: msg });
      }
    } finally {
      setActing(null);
    }
  };

  const handleVeto = async (payout: PendingPayoutAccount) => {
    if (!program || !wallet) {
      toast.error("Connect wallet to veto");
      return;
    }
    setActing(payout.pubkey + "_veto");
    try {
      const poolPk = new PublicKey(payout.pool);
      const policyPk = new PublicKey(payout.policy);

      const [pendingPayoutPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pending_payout"), policyPk.toBuffer()],
        PROGRAM_ID
      );

      await (program as any).methods
        .vetoPayout()
        .accounts({
          authority: wallet.publicKey,
          pool: poolPk,
          policy: policyPk,
          pendingPayout: pendingPayoutPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      toast.success("Payout vetoed — policy restored to active");
      setPayouts((prev) => prev.filter((p) => p.pubkey !== payout.pubkey));
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("Unauthorized")) {
        toast.error("Only the pool authority can veto");
      } else if (msg.includes("PayoutDelayPassed")) {
        toast.error("Veto window has closed — payout delay already passed");
      } else {
        toast.error("Veto failed", { description: msg });
      }
    } finally {
      setActing(null);
    }
  };

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">Payout Queue</h2>
          <p className="text-xs text-gray-500 mt-1">
            Pending payouts awaiting the 48-hour timelock. Pool authority can
            veto before the delay expires; anyone can finalize after.
          </p>
        </div>
        <button
          onClick={fetchPayouts}
          disabled={loadingPayouts || !program}
          className="text-xs text-gray-500 hover:text-[var(--accent)] disabled:opacity-40 transition-colors"
        >
          {loadingPayouts ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {!wallet && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
          Connect your wallet to view and act on pending payouts.
        </div>
      )}

      {wallet && !loadingPayouts && payouts.length === 0 && (
        <div className="py-6 text-center text-sm text-gray-500">
          No pending payouts in queue.
        </div>
      )}

      <div className="space-y-3">
        {payouts.map((payout) => {
          const ready = now >= payout.executeAfter;
          const isActing = acting === payout.pubkey;
          const isVetoing = acting === payout.pubkey + "_veto";
          return (
            <div
              key={payout.pubkey}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white">
                    ${(payout.amount / USDC_DECIMALS).toFixed(2)} USDC
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    Policy: {payout.policy.slice(0, 10)}…{payout.policy.slice(-6)}
                  </div>
                  <div className="text-xs text-gray-600 font-mono">
                    → {payout.policyholder.slice(0, 10)}…{payout.policyholder.slice(-6)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {ready ? (
                    <span className="text-xs font-medium text-[var(--accent)]">
                      ✓ Ready
                    </span>
                  ) : (
                    <span className="text-xs text-yellow-500">
                      ⏱ {timeUntil(payout.executeAfter)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleFinalize(payout)}
                  disabled={!ready || isActing || !wallet}
                  className="flex-1 bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 text-black font-bold px-3 py-1.5 rounded-lg text-xs transition-opacity"
                >
                  {isActing ? "Finalizing…" : "Finalize Payout"}
                </button>
                <button
                  onClick={() => handleVeto(payout)}
                  disabled={ready || isVetoing || !wallet}
                  className="flex-1 border border-red-500/60 hover:border-red-400 text-red-400 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-40"
                >
                  {isVetoing ? "Vetoing…" : "Veto"}
                </button>
              </div>
            </div>
          );
        })}
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
