"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useAnchorProgram } from "@/hooks/useAnchorProgram";
import { usePremiumQuote } from "@/hooks/usePremiumQuote";
import { COVERAGE_TYPES, USDC_MINT, explorerUrl } from "@/lib/constants";
import * as anchor from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import { toast } from "sonner";

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
    : quote.risk_score < 30 ? "text-emerald-400"
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

      // Fetch all pools and find one matching this coverage type
      const allPools = await (program as any).account.riskPool.all() as any[];
      const matchingPool = allPools.find(
        (p: any) => p.account.poolType === selectedType.id && p.account.isActive
      );
      if (!matchingPool) {
        toast.error(`No active pool found for ${selectedType.name}. Ask an admin to initialize one.`);
        return;
      }
      const poolPda = matchingPool.publicKey as PublicKey;
      const poolAccount = matchingPool.account;

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

      const policyholderUsdc = getAssociatedTokenAddressSync(
        USDC_MINT,
        wallet.publicKey
      );
      const poolVault = (poolAccount as { vault: PublicKey }).vault;

      // Ensure policyholder USDC ATA exists before attempting transfer
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
        oraclePubkey: wallet.publicKey, // Use wallet as mock oracle for demo
        threshold: new anchor.BN(threshold),
        comparison: (selectedType.id as number) === 1 ? 1 : 0,
      };

      const expiresAt = new anchor.BN(
        Math.floor(Date.now() / 1000) + durationDays * 86400
      );
      const payoutLamports = new anchor.BN(Math.floor(payoutAmount * 1_000_000));
      const premiumLamports = new anchor.BN(
        Math.floor(quote.premium_usdc * 1_000_000)
      );

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

      toast.success("Policy created!", {
        description: `Payout: $${payoutAmount} USDC | Premium: $${quote.premium_usdc}`,
        action: {
          label: "Explorer",
          onClick: () =>
            window.open(
              explorerUrl(tx)
            ),
        },
      });
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
        <h1 className="text-3xl font-bold text-white">Buy Coverage</h1>
        <p className="text-gray-400 mt-1">
          AI-priced parametric insurance — instant payouts on trigger.
        </p>
      </div>

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
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-gray-800 hover:border-gray-600"
            }`}
          >
            <div className="text-2xl mb-2">{ct.icon}</div>
            <div className="font-medium text-white text-sm">{ct.name}</div>
          </button>
        ))}
      </div>

      {/* Parameters */}
      <div className="border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-white">Policy Parameters</h2>

        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-xs text-gray-400">Payout Amount (USDC)</span>
            <input
              type="number"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(Number(e.target.value))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
              min={10}
              max={selectedType.maxPayout}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-gray-400">Duration (days)</span>
            <input
              type="number"
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
              min={1}
              max={365}
            />
          </label>
        </div>

        {selectedType.key === "flight_delay" && (
          <div className="grid grid-cols-3 gap-4">
            <label className="space-y-1">
              <span className="text-xs text-gray-400">Origin</span>
              <input
                value={origin}
                onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                placeholder="BOM"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-400">Destination</span>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value.toUpperCase())}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                placeholder="DEL"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-400">Delay threshold (min)</span>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
              />
            </label>
          </div>
        )}

        {selectedType.key === "crop_drought" && (
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-xs text-gray-400">Region</span>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                placeholder="Maharashtra"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-400">Rainfall threshold (mm)</span>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
              />
            </label>
          </div>
        )}

        {selectedType.key === "defi_hack" && (
          <label className="space-y-1 block">
            <span className="text-xs text-gray-400">Protocol TVL (USD)</span>
            <input
              type="number"
              value={tvl}
              onChange={(e) => setTvl(Number(e.target.value))}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
            />
          </label>
        )}
      </div>

      {/* Premium quote */}
      <div className="border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-white">AI Premium Quote</h2>
        {quoteLoading && (
          <div className="text-gray-400 text-sm">Calculating...</div>
        )}
        {quote && !quoteLoading && (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Premium</span>
              <span className="text-white font-semibold">
                ${quote.premium_usdc.toFixed(2)} USDC
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Premium %</span>
              <span className="text-white">{quote.premium_pct.toFixed(3)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Risk Score</span>
              <span className={riskColor}>{quote.risk_score}/100</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Confidence</span>
              <span className="text-white capitalize">{quote.confidence}</span>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleBuy}
        disabled={isSubmitting || !quote || !wallet}
        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-colors"
      >
        {!wallet
          ? "Connect Wallet"
          : isSubmitting
          ? "Confirming..."
          : `Buy Policy — Pay $${quote?.premium_usdc?.toFixed(2) ?? "—"} USDC`}
      </button>
    </div>
  );
}
