"use client";

import { useState } from "react";
import { useAnchorProgram } from "@/hooks/useAnchorProgram";
import { usePremiumQuote } from "@/hooks/usePremiumQuote";
import {
  API_URL,
  COVERAGE_TYPES,
  explorerUrl,
  policyScopeSeed,
  scopeHashBytes,
  USDC_MINT,
} from "@/lib/constants";
import * as anchor from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { Ed25519Program, PublicKey, Transaction } from "@solana/web3.js";
import { toast } from "sonner";

interface PolicySuccess {
  policyKey: string;
  txSig: string;
  coverageType: string;
  payoutAmount: number;
  premiumPaid: number;
  expiresAt: Date;
  threshold: number;
  thresholdDisplay: string;
  timestamp: Date;
}

// Threshold preset buttons per coverage type
const THRESHOLD_PRESETS: Record<string, { label: string; value: number }[]> = {
  earthquake: [
    { label: "M5.5", value: 550 },
    { label: "M6.5", value: 650 },
    { label: "M7.0", value: 700 },
    { label: "M7.5", value: 750 },
  ],
  flood: [
    { label: "20 ft", value: 200 },
    { label: "30 ft", value: 300 },
    { label: "40 ft", value: 400 },
    { label: "50 ft", value: 500 },
  ],
  crop_multifactor: [
    { label: "Mild (4000)", value: 4000 },
    { label: "Moderate (3000)", value: 3000 },
    { label: "Severe (2000)", value: 2000 },
    { label: "Extreme (1000)", value: 1000 },
  ],
  hurricane: [
    { label: "Cat 1 (64kt)", value: 64 },
    { label: "Cat 2 (83kt)", value: 83 },
    { label: "Cat 3 (96kt)", value: 96 },
    { label: "Cat 5 (137kt)", value: 137 },
  ],
  stablecoin_depeg: [
    { label: "$0.99", value: 9900 },
    { label: "$0.98", value: 9800 },
    { label: "$0.97", value: 9700 },
    { label: "$0.95", value: 9500 },
  ],
  bridge_hack: [
    { label: "$2B TVL floor", value: 2000 },
    { label: "$1.5B TVL floor", value: 1500 },
    { label: "$1B TVL floor", value: 1000 },
    { label: "$500M TVL floor", value: 500 },
  ],
};

export default function BuyPage() {
  const { program, wallet } = useAnchorProgram();

  const [selectedType, setSelectedType] = useState<
    (typeof COVERAGE_TYPES)[number]
  >(COVERAGE_TYPES[0]);
  const [payoutAmount, setPayoutAmount] = useState(1000);
  const [durationDays, setDurationDays] = useState(30);
  const [threshold, setThreshold] = useState<number>(
    COVERAGE_TYPES[0].defaultThreshold
  );
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [policies, setPolicies] = useState<PolicySuccess[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const extraField = (key: string) =>
    extraValues[key] ??
    (selectedType.extraFields as readonly any[]).find((f: any) => f.key === key)
      ?.default ??
    "";

  const quoteParams = {
    ...selectedType.pricingParams(
      threshold,
      payoutAmount,
      durationDays,
      extraField((selectedType.extraFields as readonly any[])[0]?.key ?? "")
    ),
    pool_utilization_pct: 50,
  };

  const {
    quote,
    loading: quoteLoading,
    isFallback,
  } = usePremiumQuote(quoteParams);

  const riskColor = !quote
    ? "text-gray-400"
    : quote.risk_score < 20
    ? "text-[var(--accent)]"
    : quote.risk_score < 50
    ? "text-yellow-400"
    : "text-red-400";

  const handleSelectType = (ct: (typeof COVERAGE_TYPES)[number]) => {
    setSelectedType(ct);
    setThreshold(ct.defaultThreshold);
    setExtraValues({});
  };

  const handleBuy = async () => {
    if (!program || !wallet || !quote) {
      toast.error("Connect wallet and get a quote first");
      return;
    }
    setIsSubmitting(true);
    try {
      const programId = program.programId;

      const allPools = (await fetch(`${API_URL}/api/pools`).then((r) =>
        r.json()
      )) as any[];
      const matchingPool = allPools.find(
        (p: any) => p.poolType === selectedType.id && p.isActive
      );
      if (!matchingPool) {
        toast.error(`No active pool found for ${selectedType.name}.`);
        return;
      }
      if (!matchingPool.poolConfig) {
        toast.error(`${selectedType.name} pool is not configured yet.`);
        return;
      }

      const poolPda = new PublicKey(matchingPool.pubkey);
      const poolConfigPda = new PublicKey(matchingPool.poolConfig.pubkey);
      const oracleAuthority = new PublicKey(
        matchingPool.poolConfig.oracleAuthority
      );
      const poolVault = new PublicKey(matchingPool.vault);

      // Enforce on-chain minimum premium floor before sending
      const minPremiumBps: number =
        matchingPool.poolConfig.minPremiumBps ?? 500;
      const floorPremiumUsdc = (payoutAmount * minPremiumBps) / 10_000;
      const effectivePremiumUsdc = Math.max(
        quote.premium_usdc,
        floorPremiumUsdc
      );
      const scopeHash = await scopeHashBytes(
        policyScopeSeed(selectedType.id, selectedType.key, extraValues)
      );

      const nonce = new anchor.BN(Date.now());
      const [policyPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("policy"),
          wallet.publicKey.toBuffer(),
          poolPda.toBuffer(),
          Buffer.from(nonce.toArray("le", 8)),
        ],
        programId
      );

      const policyholderUsdc = getAssociatedTokenAddressSync(
        USDC_MINT,
        wallet.publicKey
      );
      const connection = program.provider.connection;

      const setupTx = new Transaction();
      setupTx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          policyholderUsdc,
          wallet.publicKey,
          USDC_MINT
        )
      );
      const { blockhash } = await connection.getLatestBlockhash();
      setupTx.recentBlockhash = blockhash;
      setupTx.feePayer = wallet.publicKey;
      try {
        await (program.provider as any).sendAndConfirm(setupTx);
      } catch (e: any) {
        if (
          !e?.message?.includes("already been processed") &&
          !e?.message?.includes("already in use")
        )
          throw e;
      }

      const triggerCondition = {
        oraclePubkey: oracleAuthority,
        scopeHash,
        threshold: new anchor.BN(threshold),
        comparison: selectedType.comparison,
      };

      const { BN } = await import("@coral-xyz/anchor");
      const sigArray = quote.quote_signature || new Array(64).fill(0);
      const expiry = new BN(quote.quote_expiry || 0);

      // Create the main instruction
      const mainIx = await (program as any).methods
        .createPolicy({
          coverageType: selectedType.id,
          payoutAmount: new BN(Math.floor(payoutAmount * 1_000_000)),
          premiumAmount: new BN(Math.floor(effectivePremiumUsdc * 1_000_000)),
          triggerCondition,
          expiresAt: new BN(Math.floor(Date.now() / 1000) + durationDays * 86400),
          nonce,
          quoteExpiry: expiry,
        })
        .accounts({
          policyholder: wallet.publicKey,
          policy: policyPda,
          pool: poolPda,
          poolConfig: poolConfigPda,
          policyholderUsdc,
          poolVault,
          usdcMint: USDC_MINT,
          instructionsSysvar: "Sysvar1nstructions1111111111111111111111111",
          tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          associatedTokenProgram: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
          systemProgram: "11111111111111111111111111111111",
        })
        .instruction();

      // Build message for Ed25519 verification
      // Match the API format: [pool, coverage_type, payout, premium, expiry]
      const msg = Buffer.concat([
        poolPda.toBuffer(),
        Buffer.from([selectedType.id]),
        new BN(Math.floor(payoutAmount * 1_000_000)).toArrayLike(Buffer, "le", 8),
        new BN(Math.floor(effectivePremiumUsdc * 1_000_000)).toArrayLike(Buffer, "le", 8),
        expiry.toArrayLike(Buffer, "le", 8),
      ]);

      const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
        publicKey: new PublicKey(quote.pricing_authority || matchingPool.poolConfig.pricingAuthority).toBytes(),
        message: msg,
        signature: new Uint8Array(sigArray),
      });

      const txObj = new Transaction().add(ed25519Ix).add(mainIx);
      const tx = await (program.provider as any).sendAndConfirm(txObj);

      setPolicies((prev) => [
        {
          policyKey: policyPda.toBase58(),
          txSig: tx,
          coverageType: selectedType.name,
          payoutAmount,
          premiumPaid: effectivePremiumUsdc,
          expiresAt: new Date(Date.now() + durationDays * 86400_000),
          threshold,
          thresholdDisplay: selectedType.thresholdDisplay(threshold),
          timestamp: new Date(),
        },
        ...prev,
      ]);
      toast.success("Policy created!");
    } catch (e: unknown) {
      toast.error("Transaction failed", { description: (e as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const presets = THRESHOLD_PRESETS[selectedType.key] ?? [];

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Buy Coverage
        </h1>
        <p className="text-gray-400 mt-2">
          Parametric insurance — no adjusters, no claims. USDC sent
          automatically when the oracle confirms your trigger.
        </p>
      </div>

      {/* Active policy cards */}
      {policies.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--accent)] uppercase tracking-widest">
            Active Policies
          </h2>
          {policies.map((pol, i) => (
            <div
              key={i}
              className="relative card p-6 border-[var(--accent)]/30 overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-[var(--accent)] opacity-5 rounded-full blur-3xl pointer-events-none" />
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
                <span className="text-sm font-semibold text-[var(--accent)]">
                  Policy Active
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <div className="text-gray-500 text-xs mb-0.5">Coverage</div>
                  <div className="text-white font-medium">
                    {pol.coverageType}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-0.5">Max Payout</div>
                  <div className="text-[var(--accent)] font-bold text-base">
                    ${pol.payoutAmount.toLocaleString()} USDC
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-0.5">
                    Premium Paid
                  </div>
                  <div className="text-white">
                    ${pol.premiumPaid.toFixed(2)} USDC
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-0.5">Expires</div>
                  <div className="text-white">
                    {pol.expiresAt.toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs mb-0.5">Trigger</div>
                  <div className="text-white font-mono">
                    {pol.thresholdDisplay}
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500">
                    {pol.policyKey.slice(0, 12)}…{pol.policyKey.slice(-6)}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pol.policyKey);
                      setCopiedKey(pol.policyKey);
                      setTimeout(() => setCopiedKey(null), 1500);
                    }}
                    className={`transition-colors ${
                      copiedKey === pol.policyKey
                        ? "text-[var(--accent)]"
                        : "text-gray-500 hover:text-[var(--accent)]"
                    }`}
                  >
                    {copiedKey === pol.policyKey ? "✓" : "⧉"}
                  </button>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/claim?policy=${pol.policyKey}`}
                    className="text-xs border border-[var(--accent)]/40 text-[var(--accent)] px-3 py-1.5 rounded hover:border-[var(--accent)] transition-colors"
                  >
                    File a Claim →
                  </a>
                  <a
                    href={`/simulate?policy=${pol.policyKey}`}
                    className="text-xs border border-gray-700 text-gray-400 px-3 py-1.5 rounded hover:border-gray-500 transition-colors"
                  >
                    Simulate →
                  </a>
                  <a
                    href={explorerUrl(pol.txSig)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs border border-gray-600 text-gray-400 px-3 py-1.5 rounded hover:border-gray-500 transition-colors"
                  >
                    Explorer →
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Coverage type selector — 3×2 grid */}
      <div className="grid grid-cols-3 gap-3">
        {COVERAGE_TYPES.map((ct) => (
          <button
            key={ct.key}
            onClick={() => handleSelectType(ct)}
            className={`p-4 rounded-xl border text-left transition-all ${
              selectedType.key === ct.key
                ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                : "border-[var(--border)] hover:border-gray-600"
            }`}
          >
            <div className="text-2xl mb-1.5">{ct.icon}</div>
            <div className="font-medium text-white text-sm leading-tight">
              {ct.name}
            </div>
            <div className="text-[10px] text-gray-500 mt-1 font-mono">
              {ct.marketGap} gap
            </div>
          </button>
        ))}
      </div>

      {/* Selected category detail */}
      <div
        className="card p-5 space-y-1 border-l-2"
        style={{ borderLeftColor: selectedType.color }}
      >
        <p className="text-white font-semibold">{selectedType.name}</p>
        <p className="text-gray-400 text-sm">{selectedType.description}</p>
        <p className="text-xs text-gray-600 pt-1">
          Oracle: {selectedType.oracleSource}
        </p>
      </div>

      {/* Parameters */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-white text-sm uppercase tracking-widest">
          Policy Parameters
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs text-gray-500">Payout Amount (USDC)</span>
            <input
              type="number"
              value={payoutAmount}
              onChange={(e) => {
                const v = Math.floor(Number(e.target.value));
                if (isFinite(v) && v >= 10 && v <= selectedType.maxPayout)
                  setPayoutAmount(v);
              }}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
              min={10}
              max={selectedType.maxPayout}
              step={1}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-gray-500">
              Duration (days, max 365)
            </span>
            <input
              type="number"
              value={durationDays}
              onChange={(e) => {
                const v = Math.floor(Number(e.target.value));
                if (isFinite(v) && v >= 1 && v <= 365) setDurationDays(v);
              }}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
              min={1}
              max={365}
              step={1}
            />
          </label>
        </div>

        {/* Threshold with preset buttons */}
        <div className="space-y-2">
          <label className="space-y-1 block">
            <span className="text-xs text-gray-500">
              {selectedType.thresholdLabel}
            </span>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={threshold}
                onChange={(e) => {
                  const v = Math.floor(Number(e.target.value));
                  if (isFinite(v) && v > 0) setThreshold(v);
                }}
                className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
              />
              <span className="text-sm text-[var(--accent)] font-mono whitespace-nowrap">
                {selectedType.thresholdDisplay(threshold)}
              </span>
            </div>
          </label>
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setThreshold(p.value)}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    threshold === p.value
                      ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-dim)]"
                      : "border-[var(--border)] text-gray-400 hover:border-gray-500"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dynamic extra fields */}
        {(selectedType.extraFields as readonly any[]).length > 0 && (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${
                (selectedType.extraFields as readonly any[]).length
              }, 1fr)`,
            }}
          >
            {(selectedType.extraFields as readonly any[]).map((field: any) => (
              <label key={field.key} className="space-y-1">
                <span className="text-xs text-gray-500">{field.label}</span>
                <input
                  value={extraValues[field.key] ?? field.default}
                  onChange={(e) =>
                    setExtraValues((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  placeholder={field.placeholder}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Premium quote */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white text-sm uppercase tracking-widest">
            Actuarial Premium Quote
          </h2>
          {quote && !quoteLoading && (
            <button
              onClick={() => setShowBreakdown((v) => !v)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showBreakdown ? "Hide breakdown ↑" : "Show math ↓"}
            </button>
          )}
        </div>

        {quoteLoading && (
          <div className="text-gray-400 text-sm animate-pulse">
            Calculating…
          </div>
        )}
        {quote && !quoteLoading && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Premium</span>
              <div className="text-right">
                <span className="text-white font-bold text-lg">
                  $
                  {Math.max(
                    quote.premium_usdc,
                    (payoutAmount * 500) / 10_000
                  ).toFixed(2)}{" "}
                  USDC
                </span>
                {quote.premium_usdc < (payoutAmount * 500) / 10_000 && (
                  <div className="text-xs text-yellow-500">
                    Floor applied (5% min)
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Rate</span>
              <span className="text-white">
                {Math.max(quote.premium_pct, 5).toFixed(3)}% of payout
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Risk Score</span>
              <span className={`font-mono font-bold ${riskColor}`}>
                {quote.risk_score.toFixed(1)}/100
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Model Confidence</span>
              <span className="text-white capitalize">{quote.confidence}</span>
            </div>

            {/* Actuarial breakdown */}
            {showBreakdown &&
              quote.breakdown &&
              (quote.breakdown as any).source !== "local_fallback" && (
                <div className="mt-2 pt-3 border-t border-[var(--border)] space-y-2">
                  <div className="text-xs text-gray-500 uppercase tracking-widest mb-2">
                    Actuarial Model
                  </div>
                  {[
                    [
                      "Annual probability",
                      `${(
                        (quote.breakdown as any).annual_probability * 100
                      ).toFixed(3)}%`,
                    ],
                    [
                      "Period probability",
                      `${(
                        (quote.breakdown as any).period_probability * 100
                      ).toFixed(3)}%`,
                    ],
                    [
                      "Expected loss",
                      `$${(quote.breakdown as any).expected_loss_usdc?.toFixed(
                        2
                      )}`,
                    ],
                    [
                      "Volatility loading",
                      `×${(quote.breakdown as any).vol_loading?.toFixed(3)}`,
                    ],
                    [
                      "Utilization loading",
                      `×${(quote.breakdown as any).util_loading?.toFixed(3)}`,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label as string}
                      className="flex justify-between text-xs"
                    >
                      <span className="text-gray-500">{label}</span>
                      <span className="text-gray-300 font-mono">{value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs pt-1 border-t border-[var(--border)]">
                    <span className="text-gray-400">Formula</span>
                    <span className="text-gray-400 font-mono text-right text-[10px]">
                      E[loss] × vol_load × util_load
                    </span>
                  </div>
                </div>
              )}

            {(quote as any).breakdown?.source === "local_fallback" && (
              <div className="mt-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 space-y-1">
                <p className="text-xs text-yellow-400 font-semibold">
                  ⚠ Pricing API offline
                </p>
                <p className="text-xs text-yellow-500/80">
                  Showing estimated flat rates — not from the actuarial model.
                  Purchase is disabled until the pricing service is reachable.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleBuy}
        disabled={isSubmitting || !quote || !wallet || isFallback}
        className="w-full bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold py-3.5 rounded-lg transition-opacity text-sm tracking-wide shadow-[0_0_20px_rgba(0,255,135,0.2)]"
      >
        {!wallet
          ? "Connect Wallet"
          : isFallback
          ? "Purchase Unavailable (Pricing API Offline)"
          : isSubmitting
          ? "Confirming on-chain…"
          : `Buy ${selectedType.name} Coverage — Pay $${
              quote?.premium_usdc?.toFixed(2) ?? "—"
            } USDC`}
      </button>
    </div>
  );
}
