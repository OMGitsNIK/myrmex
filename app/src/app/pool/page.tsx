"use client";

import { useState, useEffect, useCallback } from "react";
import { usePools, PoolData } from "@/hooks/usePools";
import { useAnchorProgram } from "@/hooks/useAnchorProgram";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import { USDC_MINT, explorerUrl, COVERAGE_NAMES, USDC_DECIMALS, API_URL } from "@/lib/constants";

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
      title="Copy signature"
    >
      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
    </button>
  );
};

interface PoolActionSuccess {
  kind: "deposit" | "withdraw";
  poolKey: string;
  poolName: string;
  amount: number;
  txSig: string;
  timestamp: Date;
}

interface OracleReport {
  reported_value: number;
  reported_at: number;
  age_secs: number;
  is_fresh: boolean;
  description: string;
}

function OracleFreshness({ poolPubkey }: { poolPubkey: string }) {
  const [report, setReport] = useState<OracleReport | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/oracle-report/${poolPubkey}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => { if (d) setReport(d); })
      .catch(() => setNotFound(true));
  }, [poolPubkey]);

  if (notFound) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-600">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-600 inline-block" />
        Oracle: no report yet
      </div>
    );
  }

  if (!report) {
    return <div className="h-4 w-32 bg-[var(--surface-2)] rounded animate-pulse" />;
  }

  const ageMins = Math.round(report.age_secs / 60);
  const ageStr = ageMins < 60
    ? `${ageMins}m ago`
    : `${Math.round(ageMins / 60)}h ago`;

  return (
    <div className="flex items-center gap-1.5 text-xs" title={report.description}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${report.is_fresh ? "bg-[var(--accent)]" : "bg-yellow-500"}`} />
      <span className={report.is_fresh ? "text-[var(--accent)]" : "text-yellow-500"}>
        Oracle {report.is_fresh ? "live" : "stale"} · {ageStr}
      </span>
      <span className="text-gray-600">· val={report.reported_value}</span>
    </div>
  );
}

function PoolSkeleton() {
  return (
    <div className="card p-6 space-y-5 animate-pulse">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <div className="h-5 w-40 bg-[var(--surface-2)] rounded" />
          <div className="h-3 w-24 bg-[var(--surface-2)] rounded" />
        </div>
        <div className="h-6 w-16 bg-[var(--surface-2)] rounded" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[0,1,2,3].map((i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-12 bg-[var(--surface-2)] rounded" />
            <div className="h-5 w-20 bg-[var(--surface-2)] rounded" />
          </div>
        ))}
      </div>
      <div className="h-1 bg-[var(--surface-2)] rounded-full" />
      <div className="h-10 bg-[var(--surface-2)] rounded-lg" />
    </div>
  );
}

export default function PoolPage() {
  const { pools, loading } = usePools();
  const { program, wallet } = useAnchorProgram();
  const [depositAmounts, setDepositAmounts] = useState<Record<string, string>>({});
  const [withdrawAmounts, setWithdrawAmounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [successes, setSuccesses] = useState<PoolActionSuccess[]>([]);
  const [lpBalances, setLpBalances] = useState<Record<string, number>>({});

  const refreshLpBalance = useCallback(
    async (poolPubkey: string, lpMint: PublicKey) => {
      if (!program || !wallet) return;
      const connection = program.provider.connection;
      const providerLpAta = getAssociatedTokenAddressSync(lpMint, wallet.publicKey);
      try {
        const info = await connection.getTokenAccountBalance(providerLpAta);
        const amount = Number(info.value.uiAmountString ?? "0");
        setLpBalances((prev) => ({ ...prev, [poolPubkey]: amount }));
      } catch {
        setLpBalances((prev) => ({ ...prev, [poolPubkey]: 0 }));
      }
    },
    [program, wallet]
  );

  useEffect(() => {
    if (!program || !wallet || pools.length === 0) return;
    pools.forEach(async (p: PoolData) => {
      try {
        const poolAccount = await (program as any).account.riskPool.fetch(new PublicKey(p.pubkey)) as any;
        const lpMint = poolAccount.lpTokenMint as PublicKey;
        refreshLpBalance(p.pubkey, lpMint);
      } catch { /* ignore */ }
    });
  }, [program, wallet, pools, refreshLpBalance]);

  const handleDeposit = async (poolPubkey: string) => {
    if (!program || !wallet) return;
    const amount = Number(depositAmounts[poolPubkey]);
    if (!amount || amount <= 0) { toast.error("Enter a valid deposit amount"); return; }
    setSubmitting(poolPubkey);
    try {
      const poolPk = new PublicKey(poolPubkey);
      const poolAccount = await (program as any).account.riskPool.fetch(poolPk) as any;
      const lpMint = poolAccount.lpTokenMint as PublicKey;
      const poolVault = poolAccount.vault as PublicKey;
      const poolName = COVERAGE_NAMES[poolAccount.poolType] ?? `Pool Type ${poolAccount.poolType}`;

      const lpMintKey = new PublicKey(lpMint);
      const providerUsdc = getAssociatedTokenAddressSync(USDC_MINT, wallet.publicKey);
      const providerLpTokens = getAssociatedTokenAddressSync(lpMintKey, wallet.publicKey);

      const connection = program.provider.connection;
      const setupTx = new Transaction();
      setupTx.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, providerUsdc, wallet.publicKey, USDC_MINT));
      const { blockhash } = await connection.getLatestBlockhash();
      setupTx.recentBlockhash = blockhash;
      setupTx.feePayer = wallet.publicKey;
      await (program.provider as any).sendAndConfirm(setupTx);

      const tx = await program.methods
        .fundPool(new anchor.BN(Math.floor(amount * USDC_DECIMALS)))
        .accounts({ provider: wallet.publicKey, pool: poolPk, providerUsdc, poolVault, lpTokenMint: lpMint, providerLpTokens })
        .rpc();

      setSuccesses((prev) => [{ kind: "deposit", poolKey: poolPubkey, poolName, amount, txSig: tx, timestamp: new Date() }, ...prev]);
      setDepositAmounts((prev) => ({ ...prev, [poolPubkey]: "" }));
      toast.success(`Deposited ${amount} USDC into ${poolName} pool`);
      refreshLpBalance(poolPubkey, lpMintKey);
    } catch (e: unknown) {
      toast.error("Deposit failed", { description: (e as Error).message });
    } finally {
      setSubmitting(null);
    }
  };

  const handleWithdraw = async (poolPubkey: string) => {
    if (!program || !wallet) return;
    const amount = Number(withdrawAmounts[poolPubkey]);
    if (!amount || amount <= 0) { toast.error("Enter a valid LP token amount"); return; }
    setWithdrawing(poolPubkey);
    try {
      const poolPk = new PublicKey(poolPubkey);
      const poolAccount = await (program as any).account.riskPool.fetch(poolPk) as any;
      const lpMint = new PublicKey(poolAccount.lpTokenMint as PublicKey);
      const poolVault = poolAccount.vault as PublicKey;
      const poolName = COVERAGE_NAMES[poolAccount.poolType] ?? `Pool Type ${poolAccount.poolType}`;

      const providerUsdc = getAssociatedTokenAddressSync(USDC_MINT, wallet.publicKey);
      const providerLpTokens = getAssociatedTokenAddressSync(lpMint, wallet.publicKey);

      const connection = program.provider.connection;
      const setupTx = new Transaction();
      setupTx.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, providerUsdc, wallet.publicKey, USDC_MINT));
      const { blockhash } = await connection.getLatestBlockhash();
      setupTx.recentBlockhash = blockhash;
      setupTx.feePayer = wallet.publicKey;
      await (program.provider as any).sendAndConfirm(setupTx);

      const tx = await program.methods
        .withdrawLp(new anchor.BN(Math.floor(amount * USDC_DECIMALS)))
        .accounts({ provider: wallet.publicKey, pool: poolPk, providerUsdc, poolVault, lpTokenMint: lpMint, providerLpTokens })
        .rpc();

      setSuccesses((prev) => [{ kind: "withdraw", poolKey: poolPubkey, poolName, amount, txSig: tx, timestamp: new Date() }, ...prev]);
      setWithdrawAmounts((prev) => ({ ...prev, [poolPubkey]: "" }));
      toast.success(`Withdrew ${amount} LP tokens from ${poolName} pool`);
      refreshLpBalance(poolPubkey, lpMint);
    } catch (e: unknown) {
      toast.error("Withdrawal failed", { description: (e as Error).message });
    } finally {
      setWithdrawing(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Liquidity Pools</h1>
        <p className="text-gray-400 mt-2">
          Deposit USDC to earn premiums from policy buyers. Receive LP tokens representing your share.
          Oracle reports update every 5 minutes from live data sources.
        </p>
      </div>

      {/* Persistent success cards */}
      {successes.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--accent)] uppercase tracking-widest">Your Activity</h2>
          {successes.map((s, i) => (
            <div
              key={i}
              className={`relative card p-6 overflow-hidden ${s.kind === "deposit" ? "border-[var(--accent)]/30" : "border-blue-400/30"}`}
            >
              <div className={`absolute top-0 right-0 w-32 h-32 ${s.kind === "deposit" ? "bg-[var(--accent)]" : "bg-blue-500"} opacity-5 rounded-full blur-2xl pointer-events-none`} />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${s.kind === "deposit" ? "bg-[var(--accent)]" : "bg-blue-400"} animate-pulse`} />
                    <span className={`text-sm font-semibold ${s.kind === "deposit" ? "text-[var(--accent)]" : "text-blue-400"}`}>
                      {s.kind === "deposit" ? "Deposit Confirmed" : "Withdrawal Confirmed"}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {s.kind === "deposit" ? `$${s.amount.toLocaleString()} USDC` : `${s.amount.toLocaleString()} MYR-LP`}
                  </div>
                  <div className="text-sm text-gray-400">{s.poolName} Pool · {s.timestamp.toLocaleTimeString()}</div>
                </div>
                <div className="flex flex-col sm:items-end gap-2">
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-500 font-mono">{s.txSig.slice(0, 8)}...{s.txSig.slice(-6)}</div>
                    <CopyButton text={s.txSig} />
                  </div>
                  <a href={explorerUrl(s.txSig)} target="_blank" rel="noopener noreferrer"
                    className={`text-xs border px-3 py-1.5 rounded transition-colors ${s.kind === "deposit" ? "border-[var(--accent)]/40 text-[var(--accent)] hover:border-[var(--accent)]" : "border-blue-400/40 text-blue-400 hover:border-blue-400"}`}>
                    View on Explorer →
                  </a>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-[var(--border)] grid grid-cols-3 gap-4 text-sm">
                {s.kind === "deposit" ? <>
                  <div><div className="text-gray-500 text-xs">Deposited</div><div className="text-white font-medium">${s.amount} USDC</div></div>
                  <div><div className="text-gray-500 text-xs">LP Tokens Minted</div><div className="text-[var(--accent)] font-medium font-mono">~{s.amount} MYR-LP</div></div>
                  <div><div className="text-gray-500 text-xs">Status</div><div className="text-[var(--accent)] font-medium">Earning Premiums</div></div>
                </> : <>
                  <div><div className="text-gray-500 text-xs">LP Burned</div><div className="text-white font-medium">{s.amount} MYR-LP</div></div>
                  <div><div className="text-gray-500 text-xs">USDC Returned</div><div className="text-blue-400 font-medium font-mono">~${s.amount}</div></div>
                  <div><div className="text-gray-500 text-xs">Status</div><div className="text-blue-400 font-medium">Position Exited</div></div>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <PoolSkeleton />
          <PoolSkeleton />
          <PoolSkeleton />
        </div>
      )}

      {!loading && pools.length === 0 && (
        <div className="card p-8 text-center text-gray-400">No active pools found.</div>
      )}

      <div className="space-y-4">
        {pools.map((p: PoolData) => {
          const totalLiquidity = p.totalLiquidity / USDC_DECIMALS;
          const poolKey = p.pubkey;

          return (
            <div key={poolKey} className="card card-hover p-6 space-y-5">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="font-semibold text-white text-lg">
                    {COVERAGE_NAMES[p.poolType] ?? `Pool Type ${p.poolType}`} Pool
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {poolKey.slice(0, 10)}...{poolKey.slice(-6)}
                  </div>
                  <OracleFreshness poolPubkey={poolKey} />
                </div>
                <div className={`px-2 py-1 rounded text-xs font-medium ${p.isActive ? "bg-[var(--accent-dim)] text-[var(--accent)]" : "bg-gray-700 text-gray-400"}`}>
                  {p.isActive ? "● Active" : "Inactive"}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 text-xs mb-1">TVL</div>
                  <div className="text-white font-medium">${totalLiquidity.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Utilization</div>
                  <div className="text-white font-medium">{p.utilizationPct}%</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Est. APY</div>
                  <div className="text-[var(--accent)] font-bold">{p.estimatedApy}%</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-1">Active Policies</div>
                  <div className="text-white font-medium">{p.activePolicies}</div>
                </div>
              </div>

              {/* Utilization bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Pool utilization</span>
                  <span>{p.utilizationPct}%</span>
                </div>
                <div className="h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full transition-all"
                    style={{ width: `${Math.min(Number(p.utilizationPct), 100)}%` }}
                  />
                </div>
              </div>

              {/* Deposit row */}
              <div className="flex gap-3">
                <input
                  type="number"
                  placeholder="USDC amount"
                  value={depositAmounts[poolKey] || ""}
                  onChange={(e) => setDepositAmounts((prev) => ({ ...prev, [poolKey]: e.target.value }))}
                  className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm focus:border-[var(--accent)]/50 outline-none transition-colors"
                />
                <button
                  onClick={() => handleDeposit(poolKey)}
                  disabled={!wallet || submitting === poolKey}
                  className="bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 text-black font-bold px-5 py-2 rounded-lg text-sm transition-opacity shadow-[0_0_12px_rgba(0,255,135,0.2)]"
                >
                  {submitting === poolKey ? "Depositing..." : "Deposit"}
                </button>
              </div>

              {/* Withdraw row */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Withdraw LP tokens</span>
                  {wallet && (
                    <span className="font-mono">
                      Balance: {(lpBalances[poolKey] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} MYR-LP
                    </span>
                  )}
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      placeholder="LP amount"
                      value={withdrawAmounts[poolKey] || ""}
                      onChange={(e) => setWithdrawAmounts((prev) => ({ ...prev, [poolKey]: e.target.value }))}
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 pr-14 text-white text-sm focus:border-[var(--accent)]/50 outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const bal = lpBalances[poolKey];
                        if (bal && bal > 0) setWithdrawAmounts((prev) => ({ ...prev, [poolKey]: String(bal) }));
                      }}
                      disabled={!wallet || !(lpBalances[poolKey] > 0)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-[var(--accent)] border border-[var(--accent)]/40 rounded px-2 py-0.5 disabled:opacity-30 hover:border-[var(--accent)] transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                  <button
                    onClick={() => handleWithdraw(poolKey)}
                    disabled={!wallet || withdrawing === poolKey}
                    className="border border-blue-400/60 hover:border-blue-400 text-blue-400 font-bold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-40"
                  >
                    {withdrawing === poolKey ? "Withdrawing..." : "Withdraw"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
