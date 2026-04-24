import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
    "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

// Devnet USDC — test mint, admin has mint authority
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ||
    "HM4vdUJGhAbD44G1CDQ7gx6HFUTvaoCgxtkNPXNfP9jo"
);

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export function explorerUrl(tx: string): string {
  if (RPC_URL.includes("localhost") || RPC_URL.includes("127.0.0.1"))
    return `https://explorer.solana.com/tx/${tx}?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  if (RPC_URL.includes("devnet"))
    return `https://explorer.solana.com/tx/${tx}?cluster=devnet`;
  return `https://explorer.solana.com/tx/${tx}`;
}

export const PRICING_API =
  process.env.NEXT_PUBLIC_PRICING_API || "http://localhost:8000";


export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const USDC_DECIMALS = 1_000_000;

// ── Pool type → display name ──────────────────────────────────────────────
export const COVERAGE_NAMES: Record<number, string> = {
  0: "Earthquake 🌍",
  1: "Flood 🌊",
  2: "Crop Multi-Factor 🌾",
  3: "Hurricane 🌀",
  4: "Stablecoin Depeg 💵",
  5: "Bridge / Exchange Hack 🛡",
};

// comparison values stored on-chain: 0 = GT, 1 = LT, 2 = EQ
export const COMPARISON_LABELS: Record<number, string> = {
  0: ">",
  1: "<",
  2: "==",
};

export const DEFAULT_SCOPE_SEEDS: Record<number, string> = {
  0: "earthquake:Global",
  1: "flood:Mississippi",
  2: "crop_multifactor:Iowa",
  3: "hurricane:global",
  4: "stablecoin_depeg:usdc-usdt",
  5: "bridge_hack:wormhole-stargate-across",
};

export function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): number[] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length !== 64) return new Array(32).fill(0);
  return Array.from({ length: 32 }, (_, i) => parseInt(clean.slice(i * 2, i * 2 + 2), 16));
}

export async function scopeHashBytes(seed: string): Promise<number[]> {
  const data = new TextEncoder().encode(seed);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest));
}

export function policyScopeSeed(
  coverageTypeId: number,
  coverageKey: string,
  values: Record<string, string>
): string {
  if (coverageKey === "earthquake") return `earthquake:${values.seismic_region || "Global"}`;
  if (coverageKey === "flood") return `flood:${values.river || "Mississippi"}`;
  if (coverageKey === "crop_multifactor") return `crop_multifactor:${values.crop_region || "Iowa"}`;
  return DEFAULT_SCOPE_SEEDS[coverageTypeId] || `${coverageKey}:default`;
}

// ── Coverage type definitions (for buy page) ─────────────────────────────

export const COVERAGE_TYPES = [
  {
    id: 0,
    key: "earthquake",
    pricingKey: "earthquake",
    name: "Earthquake",
    tagline: "130M+ people in quake zones are uninsured",
    description:
      "Instant payout when USGS confirms a major earthquake above your magnitude threshold anywhere in your covered region.",
    icon: "🌍",
    color: "#f59e0b",
    maxPayout: 50_000,
    marketGap: "$40B",
    oracleSource: "USGS Earthquake API (real-time)",
    // on-chain trigger: oracle_value (magnitude×100) > threshold
    comparison: 0,
    defaultThreshold: 650,           // M6.5 × 100
    thresholdLabel: "Min magnitude × 100 (e.g. 650 = M6.5)",
    thresholdDisplay: (v: number) => `M${(v / 100).toFixed(1)}+`,
    pricingParams: (threshold: number, payout: number, days: number, region: string) => ({
      coverage_type: "earthquake",
      payout_amount_usdc: payout,
      duration_days: days,
      min_magnitude: threshold / 100,
      seismic_region: region,
    }),
    extraFields: [
      { key: "seismic_region", label: "Region", placeholder: "Pacific Ring, Japan, California…", default: "Global" },
    ],
  },
  {
    id: 1,
    key: "flood",
    pricingKey: "flood",
    name: "Flood",
    tagline: "Only 5% of global flood losses are insured",
    description:
      "Triggered when a USGS river gauge exceeds your threshold — no adjuster, no paperwork. USDC transferred automatically.",
    icon: "🌊",
    color: "#3b82f6",
    maxPayout: 100_000,
    marketGap: "$58B",
    oracleSource: "USGS Water Services (real-time gauges)",
    // oracle_value (gauge_ft×10) > threshold
    comparison: 0,
    defaultThreshold: 300,           // 30.0 ft flood stage
    thresholdLabel: "Gauge height threshold × 10 (e.g. 300 = 30.0 ft)",
    thresholdDisplay: (v: number) => `${(v / 10).toFixed(1)} ft`,
    pricingParams: (threshold: number, payout: number, days: number, region: string) => ({
      coverage_type: "flood",
      payout_amount_usdc: payout,
      duration_days: days,
      gauge_threshold_ft: threshold / 10,
      river: region,
    }),
    extraFields: [
      { key: "river", label: "River System", placeholder: "Mississippi, Missouri, Ohio…", default: "Mississippi" },
    ],
  },
  {
    id: 2,
    key: "crop_multifactor",
    pricingKey: "crop_multifactor",
    name: "Crop Multi-Factor",
    tagline: "500M smallholder farmers have no insurance",
    description:
      "A composite AI score (0–10000) measuring rainfall deficit, heat stress, and dry-day streaks. Triggers when conditions indicate severe crop loss.",
    icon: "🌾",
    color: "#22c55e",
    maxPayout: 100_000,
    marketGap: "$100B+",
    oracleSource: "Open-Meteo dual-source (forecast + archive)",
    // oracle_value (score 0–10000) < threshold — low score = bad conditions
    comparison: 1,
    defaultThreshold: 3000,          // score < 3000 = severe stress
    thresholdLabel: "Stress threshold 0–10000 (lower = worse; trigger if below)",
    thresholdDisplay: (v: number) => `Score < ${v.toLocaleString()}`,
    pricingParams: (threshold: number, payout: number, days: number, region: string) => ({
      coverage_type: "crop_multifactor",
      payout_amount_usdc: payout,
      duration_days: days,
      score_threshold: threshold,
      crop_region: region,
    }),
    extraFields: [
      { key: "crop_region", label: "Farming Region", placeholder: "Iowa, Maharashtra, Kansas…", default: "Iowa" },
    ],
  },
  {
    id: 3,
    key: "hurricane",
    pricingKey: "hurricane",
    name: "Hurricane / Cyclone",
    tagline: "Coastal communities face $30B annual uninsured losses",
    description:
      "Triggered when NOAA NHC reports a tropical cyclone with sustained winds exceeding your threshold in the covered basin.",
    icon: "🌀",
    color: "#8b5cf6",
    maxPayout: 200_000,
    marketGap: "$30B",
    oracleSource: "NOAA NHC + Weather.gov alerts",
    // oracle_value (wind knots) > threshold
    comparison: 0,
    defaultThreshold: 64,            // Hurricane force (Category 1)
    thresholdLabel: "Sustained wind knots (64 = Cat 1, 96 = Cat 3, 137 = Cat 5)",
    thresholdDisplay: (v: number) => `${v} kt sustained`,
    pricingParams: (threshold: number, payout: number, days: number, _region: string) => ({
      coverage_type: "hurricane",
      payout_amount_usdc: payout,
      duration_days: days,
      wind_threshold_knots: threshold,
    }),
    extraFields: [],
  },
  {
    id: 4,
    key: "stablecoin_depeg",
    pricingKey: "stablecoin_depeg",
    name: "Stablecoin Depeg",
    tagline: "UST wiped out $40B overnight — holders had no safety net",
    description:
      "Pays out if USDC or USDT trades below your price threshold (in basis points) on CoinGecko. Fully verifiable on-chain.",
    icon: "💵",
    color: "#06b6d4",
    maxPayout: 500_000,
    marketGap: "Growing",
    oracleSource: "CoinGecko dual-endpoint (price + market data)",
    // oracle_value (price in bps, 10000=$1.00) < threshold
    comparison: 1,
    defaultThreshold: 9700,          // $0.97 depeg
    thresholdLabel: "Depeg threshold (bps, 10000 = $1.00; e.g. 9700 = $0.97)",
    thresholdDisplay: (v: number) => `$${(v / 10000).toFixed(3)}`,
    pricingParams: (threshold: number, payout: number, days: number, _region: string) => ({
      coverage_type: "stablecoin_depeg",
      payout_amount_usdc: payout,
      duration_days: days,
      depeg_threshold_bps: threshold,
    }),
    extraFields: [],
  },
  {
    id: 5,
    key: "bridge_hack",
    pricingKey: "bridge_hack",
    name: "Bridge / Exchange Hack",
    tagline: "$3B+ lost to bridge exploits in 2023 alone",
    description:
      "Triggers when DeFiLlama reports a sudden collapse in combined bridge TVL (Wormhole, Stargate, Across), cross-checked against the hacks feed.",
    icon: "🛡",
    color: "#ef4444",
    maxPayout: 500_000,
    marketGap: "$3B+ annually",
    oracleSource: "DeFiLlama TVL + hacks endpoint",
    // oracle_value (TVL in millions) < threshold — drop from baseline
    comparison: 1,
    defaultThreshold: 1500,          // < $1.5B combined = likely exploit
    thresholdLabel: "Bridge TVL floor in $M (trigger if total drops below this)",
    thresholdDisplay: (v: number) => `< $${(v / 1000).toFixed(1)}B TVL`,
    pricingParams: (threshold: number, payout: number, days: number, _region: string) => ({
      coverage_type: "bridge_hack",
      payout_amount_usdc: payout,
      duration_days: days,
      tvl_drop_threshold_pct: threshold,  // TVL floor in $M; pricing engine derives implied drop %
    }),
    extraFields: [],
  },
] as const;

// ── On-chain pool pubkeys ─────────────────────────────────────────────────
// type → pool pubkey on devnet
export const POOL_BY_TYPE: Record<number, string> = {
  0: "EHxPZAMvRhumjFeChfeD9bn2Ju1RWf7RM45pY5vzEhNH",  // Earthquake
  1: "HfyGsQVVsxt6BNM7UzTepBo91DKYdqLy7RKuLrwnM1YY",  // Flood
  2: "HuPG3dmBftRCAwg71tro7pmp2hjoCT8KWaNtytwUqUo2",  // Crop MultiF
  3: "ZZWgmeRUSdQyuarSb2zPFron2x88UgexhTQn8hJr9uD",   // Hurricane
  4: "CcGbU74HpT8sjDU5NDDWFzBPYEARBEfAac4ovDWwgxWU",  // Stablecoin Depeg
  5: "AqKUYemw3A6GbYFnCFwE9S1f1QCfhH4EAjFQCDxyfUtQ",  // Bridge Hack
};
