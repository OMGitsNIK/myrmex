import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
    "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

// Devnet USDC
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ||
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export function explorerUrl(tx: string): string {
  const rpc = RPC_URL;
  if (rpc.includes("localhost") || rpc.includes("127.0.0.1")) {
    return `https://explorer.solana.com/tx/${tx}?cluster=custom&customUrl=${encodeURIComponent(rpc)}`;
  }
  if (rpc.includes("devnet")) return `https://explorer.solana.com/tx/${tx}?cluster=devnet`;
  if (rpc.includes("testnet")) return `https://explorer.solana.com/tx/${tx}?cluster=testnet`;
  return `https://explorer.solana.com/tx/${tx}`;
}

export const PRICING_API =
  process.env.NEXT_PUBLIC_PRICING_API || "http://localhost:8000";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const COVERAGE_TYPES = [
  {
    id: 0,
    key: "flight_delay",
    name: "Flight Delay",
    description: "Instant payout if your flight is delayed beyond your threshold",
    icon: "✈",
    maxPayout: 500,
    defaultThreshold: 120,
    thresholdLabel: "Delay threshold (minutes)",
    params: ["origin", "destination", "delay_threshold_minutes"],
  },
  {
    id: 1,
    key: "crop_drought",
    name: "Crop Drought",
    description: "Payout if rainfall drops below threshold during growing season",
    icon: "🌾",
    maxPayout: 10000,
    defaultThreshold: 20,
    thresholdLabel: "Rainfall threshold (mm)",
    params: ["region", "rainfall_threshold_mm"],
  },
  {
    id: 3,
    key: "defi_hack",
    name: "DeFi Protocol Hack",
    description: "Coverage against smart contract exploits and oracle manipulation",
    icon: "🛡",
    maxPayout: 50000,
    defaultThreshold: 0,
    thresholdLabel: "Protocol TVL (USD)",
    params: ["protocol_tvl_usd"],
  },
] as const;

export const POOLS = [
  {
    key: "flight-global",
    name: "Flight Global",
    poolType: 0,
    description: "All international flight routes",
  },
  {
    key: "monsoon-india",
    name: "Monsoon India",
    poolType: 1,
    description: "Indian subcontinent rainfall index",
  },
  {
    key: "defi-protocol",
    name: "DeFi Protocol",
    poolType: 3,
    description: "Smart contract exploit coverage",
  },
] as const;
