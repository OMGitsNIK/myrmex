"use client";

import { useState } from "react";
import { useAnchorProgram } from "@/hooks/useAnchorProgram";
import { usePremiumQuote } from "@/hooks/usePremiumQuote";
import { COVERAGE_TYPES, USDC_MINT, API_URL, explorerUrl } from "@/lib/constants";
import * as anchor from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import { toast } from "sonner";

interface PolicySuccess {
  policyKey: string;
  txSig: string;
  coverageType: string;
  payoutAmount: number;
  premiumPaid: number;
  expiresAt: Date;
  threshold: number;
  timestamp: Date;
}

export default function BuyPage() {
  const { program, wallet } = useAnchorProgram();
  const [selectedType, setSelectedType] = useState<typeof COVERAGE_TYPES[number]>(COVERAGE_TYPES[0]);
  const [payoutAmount, setPayoutAmount] = useState(100);
  const [durationDays, setDurationDays] = useState(30);
  const [origin, setOrigin] = useState("BOM");
  const [destination, setDestination] = useState("DEL");
  const [threshold, setThreshold] = useState(120);
  const [region, setRegion] = useState("Maharashtra");
  const [tvl, setTvl] = useState(1000000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [policies, setPolicies] = useState<PolicySuccess[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const quoteParams =
    selectedType.key === "flight_delay"
      ? {
          coverage_type: selectedType.key,
          payout_amount_usdc: payoutAmount,
          duration_days: durationDays,
          origin,
          destination,
          delay_threshold_minutes: threshold,
        }
      : selectedType.key === "crop_drought"
      ? {
          coverage_type: selectedType.key,
          payout_amount_usdc: payoutAmount,
          duration_days: durationDays,
          region,
          rainfall_threshold_mm: threshold,
        }
      : {
          coverage_type: selectedType.key,
          payout_amount_usdc: payoutAmount,
          duration_days: durationDays,
          protocol_tvl_usd: tvl,
        };

  const { quote, loading: quoteLoading } = usePremiumQuote(quoteParams);

  const riskColor =
    !quote ? "text-gray-400"
    : quote.risk_score < 30 ? "text-[var(--accent)]"
    : quote.risk_score < 70 ? "text-yellow-400"
    : "text-red-400";

  const handleBuy = async () => {
    if (!program || !wallet || !quote) {
      toast.error("Connect wallet and get a quote first");
      return;
    }
    setIsSubmitting(true);
    try {
      const programId = program.programId;

      const allPools = await fetch(`${API_URL}/api/pools`).then((r) => r.json()) as any[];
      const matchingPool = allPools.find(
        (p: any) => p.poolType === selectedType.id && p.isActive
      );
      if (!matchingPool) {
        toast.error(`No active pool found for ${selectedType.name}. Ask an admin to initialize one.`);
        return;
      }
      const poolPda = new PublicKey(matchingPool.pubkey);
      const poolAccount = matchingPool;

      const nonce = new anchor.BN(Math.floor(Date.now() / 1000));
      const [policyPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("policy"),
          wallet.publicKey.toBuffer(),
          poolPda.toBuffer(),
          Buffer.from(nonce.toArray("le", 8)),
        ],
        programId
      );

      const policyholderUsdc = getAssociatedTokenAddressSync(USDC_MINT, wallet.publicKey);
      const poolVault = new PublicKey((poolAccount as { vault: string }).vault);

      const connection = program.provider.connection;
      const setupTx = new Transaction();
      setupTx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey, policyholderUsdc, wallet.publicKey, USDC_MINT
        )
      );
      const { blockhash } = await connection.getLatestBlockhash();
      setupTx.recentBlockhash = blockhash;
      setupTx.feePayer = wallet.publicKey;
      await (program.provider as any).sendAndConfirm(setupTx);

      const triggerCondition = {
        oraclePubkey: wallet.publicKey,
        threshold: new anchor.BN(threshold),
        comparison: (selectedType.id as number) === 1 ? 1 : 0,
      };

      const expiresAt = new anchor.BN(Math.floor(Date.now() / 1000) + durationDays * 86400);
      const payoutLamports = new anchor.BN(Math.floor(payoutAmount * 1_000_000));
      const premiumLamports = new anchor.BN(Math.floor(quote.premium_usdc * 1_000_000));

      const tx = await program.methods
        .createPolicy(
          selectedType.id,
          payoutLamports,
          premiumLamports,
          triggerCondition,
          expiresAt,
          nonce
        )
        .accounts({
          policyholder: wallet.publicKey,
          policy: policyPda,
          pool: poolPda,
          policyholderUsdc,
          poolVault,
          usdcMint: USDC_MINT,
        })
        .rpc();

      setPolicies((prev) => [
        {
          policyKey: policyPda.toBase58(),
          txSig: tx,
          coverageType: selectedType.name,
          payoutAmount,
          premiumPaid: quote.premium_usdc,
          expiresAt: new Date(Date.now() + durationDays * 86400 * 1000),
          threshold,
          timestamp: new Date(),
        },
        ...prev,
      ]);
      toast.success("Policy created!");
    } catch (e: unknown) {
      const err = e as Error;
      toast.error("Transaction failed", { description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Buy Coverage</h1>
        <p className="text-gray-400 mt-2">
          AI-priced parametric insurance — instant payouts on trigger.
        </p>
      </div>

      {/* Persistent policy success cards */}
      {policies.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--accent)] uppercase tracking-widest">Active Policies</h2>
          {policies.map((pol, i) => (
            <div
              key={i}
              className="relative card p-6 border-[var(--accent)]/30 overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-[var(--accent)] opacity-5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
                <span className="text-sm font-semibold text-[var(--accent)]">Policy Active</span>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <div className="text-gray-500 text-xs mb-0.5">Coverage Type</div>
                  <div className="text-white font-medium">{pol.coverageType}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-0.5">Max Payout</div>
                  <div className="text-[var(--accent)] font-bold text-base">${pol.payoutAmount} USDC</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-0.5">Premium Paid</div>
                  <div className="text-white font-medium">${pol.premiumPaid.toFixed(2)} USDC</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-0.5">Expires</div>
                  <div className="text-white font-medium">{pol.expiresAt.toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-0.5">Trigger Threshold</div>
                  <div className="text-white font-mono">{pol.threshold}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-0.5">Created</div>
                  <div className="text-white">{pol.timestamp.toLocaleTimeString()}</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-mono text-gray-500">
                    Policy: {pol.policyKey.slice(0, 12)}...{pol.policyKey.slice(-8)}
                  </div>
                  <button
                    onClick={() => copyKey(pol.policyKey)}
                    title="Copy policy public key"
                    className={`transition-colors ${copiedKey === pol.policyKey ? "text-[var(--accent)]" : "text-gray-500 hover:text-[var(--accent)]"}`}
                  >
                    {copiedKey === pol.policyKey ? (
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
                </div>
                <a
                  href={explorerUrl(pol.txSig)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs border border-[var(--accent)]/40 text-[var(--accent)] px-3 py-1.5 rounded hover:border-[var(--accent)] transition-colors whitespace-nowrap"
                >
                  View on Explorer →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Coverage type selector */}
      <div className="grid grid-cols-3 gap-4">
        {COVERAGE_TYPES.map((ct) => (
          <button
            key={ct.key}
            onClick={() => {
              setSelectedType(ct);
              setThreshold(ct.defaultThreshold);
            }}
            className={`p-4 rounded-xl border text-left transition-colors ${
              selectedType.key === ct.key
                ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                : "border-[var(--border)] hover:border-gray-600"
            }`}
          >
            <div className="text-2xl mb-2">{ct.icon}</div>
            <div className="font-medium text-white text-sm">{ct.name}</div>
          </button>
        ))}
      </div>

      {/* Parameters */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-white text-sm uppercase tracking-widest">Policy Parameters</h2>

        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs text-gray-500">Payout Amount (USDC)</span>
            <input
              type="number"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(Number(e.target.value))}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
              min={10}
              max={selectedType.maxPayout}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-gray-500">Duration (days)</span>
            <input
              type="number"
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
              min={1}
              max={365}
            />
          </label>
        </div>

        {selectedType.key === "flight_delay" && (
          <div className="grid grid-cols-3 gap-4">
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Origin</span>
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
                placeholder="BOM"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Destination</span>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value.toUpperCase())}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
                placeholder="DEL"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Delay threshold (min)</span>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
              />
            </label>
          </div>
        )}

        {selectedType.key === "crop_drought" && (
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Region</span>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
                placeholder="Maharashtra"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Rainfall threshold (mm)</span>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
              />
            </label>
          </div>
        )}

        {selectedType.key === "defi_hack" && (
          <label className="space-y-1 block">
            <span className="text-xs text-gray-500">Protocol TVL (USD)</span>
            <input
              type="number"
              value={tvl}
              onChange={(e) => setTvl(Number(e.target.value))}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
            />
          </label>
        )}
      </div>

      {/* Premium quote */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-white text-sm uppercase tracking-widest">AI Premium Quote</h2>
        {quoteLoading && (
          <div className="text-gray-400 text-sm">Calculating...</div>
        )}
        {quote && !quoteLoading && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Premium</span>
              <span className="text-white font-bold text-lg">${quote.premium_usdc.toFixed(2)} USDC</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Premium %</span>
              <span className="text-white">{quote.premium_pct.toFixed(3)}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Risk Score</span>
              <span className={`font-mono font-bold ${riskColor}`}>{quote.risk_score}/100</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Confidence</span>
              <span className="text-white capitalize">{quote.confidence}</span>
            </div>
            {(quote as any).breakdown?.source === "local_fallback" && (
              <div className="text-xs text-yellow-500/70 pt-1">
                Estimate only — pricing API offline. Quote uses actuarial fallback rates.
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleBuy}
        disabled={isSubmitting || !quote || !wallet}
        className="w-full bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3.5 rounded-lg transition-opacity text-sm tracking-wide shadow-[0_0_20px_rgba(0,255,135,0.2)]"
      >
        {!wallet
          ? "Connect Wallet"
          : isSubmitting
          ? "Confirming on-chain..."
          : `Buy Policy — Pay $${quote?.premium_usdc?.toFixed(2) ?? "—"} USDC`}
      </button>
    </div>
  );
}
