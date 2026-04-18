"use client";
export const dynamic = "force-dynamic";

import { usePolicies } from "@/hooks/usePolicies";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

const COVERAGE_NAMES: Record<number, string> = {
  0: "Flight Delay ✈",
  1: "Crop Drought 🌾",
  2: "Crop Flood 🌊",
  3: "DeFi Hack 🛡",
  4: "Stablecoin Depeg",
  5: "Hurricane 🌀",
  6: "Hospitalization 🏥",
};

const COMPARISON_LABELS: Record<number, string> = {
  0: ">",
  1: "<",
  2: "==",
};

export default function PortfolioPage() {
  const wallet = useAnchorWallet();
  const { policies, loading } = usePolicies();

  if (!wallet) {
    return (
      <div className="text-center py-20 text-gray-400">
        Connect your wallet to view your policies.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">My Portfolio</h1>
        <p className="text-gray-400 mt-1">Your active and historical policies.</p>
      </div>

      {loading && (
        <div className="text-gray-400">Loading policies from chain...</div>
      )}

      {!loading && policies.length === 0 && (
        <div className="border border-gray-800 rounded-xl p-8 text-center text-gray-400">
          No policies found. Buy your first policy to get started.
        </div>
      )}

      <div className="space-y-4">
        {policies.map((p: any) => {
          const acc = p.account;
          const payout = acc.payoutAmount.toNumber() / 1_000_000;
          const premium = acc.premiumAmount.toNumber() / 1_000_000;
          const expiresAt = new Date(acc.expiresAt.toNumber() * 1000);
          const isExpired = expiresAt < new Date();

          const status = acc.isClaimed
            ? { label: "Claimed", color: "bg-blue-500/20 text-blue-400" }
            : !acc.isActive || isExpired
            ? { label: "Expired", color: "bg-gray-700 text-gray-400" }
            : { label: "Active", color: "bg-emerald-500/20 text-emerald-400" };

          const tc = acc.triggerCondition;
          const compLabel = COMPARISON_LABELS[tc.comparison] || "?";

          return (
            <div
              key={p.publicKey.toBase58()}
              className="border border-gray-800 rounded-xl p-6 space-y-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-white">
                    {COVERAGE_NAMES[acc.coverageType] || `Type ${acc.coverageType}`}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {p.publicKey.toBase58().slice(0, 16)}...
                  </div>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${status.color}`}
                >
                  {status.label}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-400">Payout</div>
                  <div className="text-white font-medium">
                    ${payout.toLocaleString()} USDC
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Premium Paid</div>
                  <div className="text-white font-medium">
                    ${premium.toFixed(2)} USDC
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Trigger</div>
                  <div className="text-white font-medium">
                    value {compLabel} {tc.threshold.toNumber()}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Expires</div>
                  <div className="text-white font-medium">
                    {expiresAt.toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
