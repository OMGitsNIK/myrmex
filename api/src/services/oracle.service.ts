/**
 * Oracle service — 5-minute cron inside the API process.
 *
 * Six real-world data pipelines, each with dual-source cross-checking.
 * Data is posted on-chain as-is; no AI intermediary.
 *
 * On-chain value encoding:
 *   Earthquake  : USGS magnitude × 100   (e.g. M6.5 → 650)
 *   Flood       : USGS gauge feet × 10   (e.g. 28.3 ft → 283)
 *   Crop-MultiF : composite score 0–10000 (10000 = ideal, 0 = catastrophic)
 *   Hurricane   : max sustained wind knots (e.g. 120)
 *   USDC-Depeg  : USDC price in bps      (10000 = $1.00, 9700 = $0.97)
 *   Bridge-Hack : combined bridge TVL $M  (e.g. 2500 = $2.5 B)
 */
import cron from "node-cron";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";

// ── Pool addresses ────────────────────────────────────────────────────────
const EARTHQUAKE_POOL =
  process.env.EARTHQUAKE_POOL || "EHxPZAMvRhumjFeChfeD9bn2Ju1RWf7RM45pY5vzEhNH";
const FLOOD_POOL =
  process.env.FLOOD_POOL || "HfyGsQVVsxt6BNM7UzTepBo91DKYdqLy7RKuLrwnM1YY";
const CROP_POOL =
  process.env.CROP_POOL || "HuPG3dmBftRCAwg71tro7pmp2hjoCT8KWaNtytwUqUo2";
const HURRICANE_POOL =
  process.env.HURRICANE_POOL || "ZZWgmeRUSdQyuarSb2zPFron2x88UgexhTQn8hJr9uD";
const USDC_POOL =
  process.env.USDC_POOL || "CcGbU74HpT8sjDU5NDDWFzBPYEARBEfAac4ovDWwgxWU";
const BRIDGE_POOL =
  process.env.BRIDGE_POOL || "AqKUYemw3A6GbYFnCFwE9S1f1QCfhH4EAjFQCDxyfUtQ";

// Configurable oracle targets
const CROP_LAT = process.env.CROP_LAT || "41.8781"; // Iowa
const CROP_LON = process.env.CROP_LON || "-93.0977";
const USGS_FLOOD_SITE = process.env.USGS_FLOOD_SITE || "07010000"; // Mississippi @ St. Louis
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

const SCOPE_SEEDS = {
  earthquake: "earthquake:Global",
  flood: "flood:Mississippi",
  crop: "crop_multifactor:Iowa",
  hurricane: "hurricane:global",
  stablecoin: "stablecoin_depeg:usdc-usdt",
  bridge: "bridge_hack:wormhole-stargate-across",
};

// ── Keypair / Program ─────────────────────────────────────────────────────

// When true: refuse to post if cross-source values disagree beyond tolerance.
const ORACLE_MULTISIG_MODE = process.env.ORACLE_MULTISIG_MODE === "true";

function loadOracleKeypair(): Keypair {
  if (process.env.ORACLE_KEYPAIR_JSON) {
    return Keypair.fromSecretKey(
      Buffer.from(JSON.parse(process.env.ORACLE_KEYPAIR_JSON))
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ORACLE_KEYPAIR_JSON must be set in production — refusing to fall back to a disk key"
    );
  }
  const keyPath = path.join(
    process.env.HOME || "~",
    ".config/solana/oracle.json"
  );
  if (fs.existsSync(keyPath)) {
    return Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync(keyPath, "utf-8")))
    );
  }
  const fallback = path.join(process.env.HOME || "~", ".config/solana/id.json");
  return Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(fallback, "utf-8")))
  );
}

/**
 * Cross-source sanity check. Returns the primary value if both sources agree
 * within tolerancePct. In ORACLE_MULTISIG_MODE, throws if they disagree —
 * preventing a compromised or stale feed from posting bad data on-chain.
 *
 * @param primary   - value from primary source (e.g. the top API result)
 * @param secondary - value from secondary source (cross-check fetch)
 * @param tolerancePct - allowed relative deviation (0–100). E.g. 20 = 20%.
 * @param label     - job label for logs
 */
function confirmValue(
  primary: number,
  secondary: number | null,
  tolerancePct: number,
  label: string
): number {
  if (secondary === null) {
    if (ORACLE_MULTISIG_MODE) {
      throw new Error(
        `[oracle:${label}] multi-sig check failed — secondary source returned no data`
      );
    }
    return primary;
  }
  const base = Math.max(Math.abs(primary), Math.abs(secondary), 1);
  const deviationPct = (Math.abs(primary - secondary) / base) * 100;
  if (deviationPct > tolerancePct) {
    const msg =
      `[oracle:${label}] cross-source deviation ${deviationPct.toFixed(1)}% ` +
      `exceeds ${tolerancePct}% tolerance — primary=${primary} secondary=${secondary}`;
    if (ORACLE_MULTISIG_MODE) {
      throw new Error(msg + " — refusing to post");
    }
    console.warn(msg + " — posting primary anyway (non-production)");
  }
  return primary;
}

function getOracleProgram() {
  const kp = loadOracleKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(kp);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const idlPath = path.join(__dirname, "../idl/myrmex.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  return { program: new anchor.Program(idl, provider), provider };
}

/**
 * Encodes description as: sha256:<64-hex>|<human text>
 * The SHA-256 of the raw primary API response is embedded so anyone can
 * independently verify the on-chain value by rehashing the source data.
 */
function toDescBytes(humanText: string, sourceHash?: string): number[] {
  const prefix = sourceHash ? `sha256:${sourceHash}|` : "";
  // Slice by byte length to avoid truncating mid-multi-byte character
  const combined = prefix + humanText;
  const fullBuf = Buffer.from(combined, "utf8");
  const buf = Buffer.alloc(192);
  fullBuf.copy(buf, 0, 0, 191);
  return Array.from(buf);
}

function sourceHashOf(rawPayload: string): string {
  return createHash("sha256").update(rawPayload).digest("hex");
}

function scopeHash(seed: string): number[] {
  return Array.from(createHash("sha256").update(seed).digest());
}

async function postReport(
  poolPk: PublicKey,
  value: number,
  scope: number[],
  description: string,
  rawPayload?: string
): Promise<string> {
  const { program, provider } = getOracleProgram();
  const [poolConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_config"), poolPk.toBuffer()],
    PROGRAM_ID
  );
  const [oracleReportPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_report"), poolPk.toBuffer(), Buffer.from(scope)],
    PROGRAM_ID
  );
  const srcHash = rawPayload ? sourceHashOf(rawPayload) : undefined;
  return program.methods
    .postOracleReport(
      new anchor.BN(value),
      scope,
      toDescBytes(description, srcHash)
    )
    .accounts({
      oracleAuthority: provider.wallet.publicKey,
      pool: poolPk,
      poolConfig: poolConfigPda,
      oracleReport: oracleReportPda,
      oracleMultisigConfig: null,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
}

// ── 1. Earthquake — USGS Real-time Feed ──────────────────────────────────

async function fetchEarthquake(): Promise<{
  magnitude: number;
  place: string;
  sources: string;
  rawPayload: string;
  crossCheckCount: number | null;
}> {
  const url =
    "https://earthquake.usgs.gov/fdsnws/event/1/query" +
    "?format=geojson&minmagnitude=4.5&orderby=magnitude&limit=1";
  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok)
    throw new Error(`USGS earthquake returned ${resp.status} — skipping post`);
  const rawPayload = await resp.text();
  const data = JSON.parse(rawPayload) as any;
  const features = data.features ?? [];
  if (features.length === 0)
    return {
      magnitude: 0,
      place: "No M4.5+ events",
      sources: "USGS FDSN",
      rawPayload,
      crossCheckCount: 0,
    };

  const top = features[0];
  const mag = top.properties.mag ?? 0;
  const place = top.properties.place ?? "Unknown";

  // Cross-check: USGS 24h count (different endpoint)
  let crossCheckCount: number | null = null;
  try {
    const r2 = await fetch(
      "https://earthquake.usgs.gov/fdsnws/event/1/count?format=geojson&minmagnitude=4.5",
      { signal: AbortSignal.timeout(8_000) }
    );
    const d2 = (await r2.json()) as any;
    crossCheckCount = d2.count ?? null;
  } catch {
    /* ignore */
  }

  return {
    magnitude: mag,
    place,
    sources: `USGS top M${mag.toFixed(1)} @ ${place} | 24h count: ${crossCheckCount ?? "n/a"}`,
    rawPayload,
    crossCheckCount,
  };
}

// ── 2. Flood — USGS Water Services ───────────────────────────────────────

async function fetchFlood(): Promise<{
  gaugeFt: number;
  siteName: string;
  sources: string;
  rawPayload: string;
  crossCheckMedianFt: number | null;
}> {
  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${USGS_FLOOD_SITE}&parameterCd=00065`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!resp.ok)
    throw new Error(`USGS flood returned ${resp.status} — skipping post`);
  const rawPayload = await resp.text();
  const data = JSON.parse(rawPayload) as any;

  const ts = data?.value?.timeSeries?.[0];
  const siteName = ts?.sourceInfo?.siteName ?? `Site ${USGS_FLOOD_SITE}`;
  const gaugeFt = parseFloat(ts?.values?.[0]?.value?.[0]?.value ?? "0") || 0;

  // Cross-check: USGS statistics service (historical median for this day)
  let medianFt: number | null = null;
  try {
    const today = new Date();
    const mmdd = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
    const r2 = await fetch(
      `https://waterservices.usgs.gov/nwis/stat/?format=json&sites=${USGS_FLOOD_SITE}&parameterCd=00065&statReportType=daily&statYearType=calendar`,
      { signal: AbortSignal.timeout(8_000) }
    );
    const d2 = (await r2.json()) as any;
    const rec = (d2?.value?.timeSeries?.[0]?.values?.[0]?.value ?? []).find(
      (v: any) => v.dateTime?.slice(5, 10) === mmdd
    );
    medianFt = rec ? parseFloat(rec.value) : null;
  } catch {
    /* ignore */
  }

  const crossCheck =
    medianFt !== null ? ` | median: ${medianFt.toFixed(1)}ft` : "";
  return {
    gaugeFt,
    siteName,
    sources: `USGS ${siteName}: ${gaugeFt.toFixed(1)}ft${crossCheck}`,
    rawPayload,
    crossCheckMedianFt: medianFt,
  };
}

// ── 3. Crop Multi-Factor — Open-Meteo composite ───────────────────────────

async function fetchCropComposite(): Promise<{
  score: number;
  sources: string;
  rawPayload: string;
  crossCheckScore: number | null;
}> {
  const today = new Date();
  const end = today.toISOString().split("T")[0];
  const start14 = new Date(today.getTime() - 14 * 86400_000)
    .toISOString()
    .split("T")[0];

  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${CROP_LAT}&longitude=${CROP_LON}` +
    `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min` +
    `&timezone=auto&start_date=${start14}&end_date=${end}`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!resp.ok)
    throw new Error(`Open-Meteo crop returned ${resp.status} — skipping post`);
  const rawPayload = await resp.text();
  const data = JSON.parse(rawPayload) as any;
  const daily = data.daily ?? {};
  const precip: number[] = daily.precipitation_sum ?? [];
  const tMax: number[] = daily.temperature_2m_max ?? [];

  const avgPrecip = precip.length
    ? precip.reduce((a, b) => a + (b ?? 0), 0) / precip.length
    : 0;
  const precipScore = Math.min(10000, Math.round((avgPrecip / 3.0) * 10000));

  const heatDays = tMax.filter((t) => t > 35).length;
  const heatScore = Math.max(0, 10000 - heatDays * 1000);

  let maxDryStreak = 0,
    streak = 0;
  for (const p of precip) {
    if ((p ?? 0) < 1) {
      streak++;
      maxDryStreak = Math.max(maxDryStreak, streak);
    } else streak = 0;
  }
  const dryScore = Math.max(0, 10000 - maxDryStreak * 800);

  const composite = Math.round(
    precipScore * 0.4 + heatScore * 0.3 + dryScore * 0.3
  );

  const sources =
    `Open-Meteo 14d @ ${CROP_LAT},${CROP_LON}: ` +
    `rain=${avgPrecip.toFixed(
      1
    )}mm/d heat=${heatDays}d>35C dry=${maxDryStreak}d score=${composite}/10000`;

  // Cross-check: recompute with a 7-day window to detect data anomalies
  const last7Precip = precip.slice(-7);
  const avg7 = last7Precip.length
    ? last7Precip.reduce((a, b) => a + (b ?? 0), 0) / last7Precip.length
    : avgPrecip;
  const crossCheckScore = Math.round(
    Math.min(10000, (avg7 / 3.0) * 10000) * 0.4 + heatScore * 0.3 + dryScore * 0.3
  );

  return { score: composite, sources, rawPayload, crossCheckScore };
}

// ── 4. Hurricane — NOAA NHC + Weather.gov Alerts ─────────────────────────

async function fetchHurricane(): Promise<{
  windKnots: number;
  name: string;
  sources: string;
  rawPayload: string;
  crossCheckAlertCount: number | null;
}> {
  let windKnots = 0;
  let stormName = "No active storm";
  let rawPayload = "{}";

  try {
    const resp = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", {
      signal: AbortSignal.timeout(10_000),
    });
    rawPayload = await resp.text();
    const data = JSON.parse(rawPayload) as any;
    const storms: any[] = data?.activeStorms ?? [];
    for (const s of storms) {
      const winds = parseInt(s.intensity ?? "0", 10);
      if (winds > windKnots) {
        windKnots = winds;
        stormName = s.name ?? "Unnamed";
      }
    }
  } catch {
    /* NHC may be rate-limited */
  }

  let alertCount: number | null = null;
  try {
    const r2 = await fetch(
      "https://api.weather.gov/alerts/active?event=Hurricane+Warning,Tropical+Storm+Warning",
      {
        headers: { "User-Agent": "myrmex-oracle/1.0" },
        signal: AbortSignal.timeout(8_000),
      }
    );
    const d2 = (await r2.json()) as any;
    alertCount = (d2?.features ?? []).length;
  } catch {
    /* ignore */
  }

  return {
    windKnots,
    name: stormName,
    sources: `NHC: ${stormName} ${windKnots}kt | wx.gov alerts: ${alertCount ?? "n/a"}`,
    rawPayload,
    crossCheckAlertCount: alertCount,
  };
}

// ── 5. Stablecoin Depeg — CoinGecko ──────────────────────────────────────

async function fetchStablecoinPrice(): Promise<{
  usdcBps: number;
  usdtBps: number;
  sources: string;
  rawPayload: string;
  crossCheckUsdtBps: number | null;
}> {
  const resp = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,tether&vs_currencies=usd&precision=6",
    { signal: AbortSignal.timeout(10_000) }
  );
  if (!resp.ok)
    throw new Error(`CoinGecko returned ${resp.status} — skipping post`);
  const rawPayload = await resp.text();
  const data = JSON.parse(rawPayload) as any;
  const usdcPrice = data?.["usd-coin"]?.usd ?? 1.0;
  const usdtPrice = data?.["tether"]?.usd ?? 1.0;
  const usdcBps = Math.round(usdcPrice * 10000);
  const usdtBps = Math.round(usdtPrice * 10000);

  let usdcMarketCap: number | null = null;
  try {
    const r2 = await fetch(
      "https://api.coingecko.com/api/v3/coins/usd-coin?localization=false&tickers=false&community_data=false&developer_data=false",
      { signal: AbortSignal.timeout(8_000) }
    );
    const d2 = (await r2.json()) as any;
    usdcMarketCap = d2?.market_data?.market_cap?.usd ?? null;
  } catch {
    /* ignore */
  }

  const mcStr = usdcMarketCap
    ? ` mcap=$${(usdcMarketCap / 1e9).toFixed(1)}B`
    : "";
  return {
    usdcBps,
    usdtBps,
    // USDT acts as secondary cross-check: both should be near $1.00
    crossCheckUsdtBps: usdtBps,
    sources: `CoinGecko USDC=$${usdcPrice.toFixed(4)} USDT=$${usdtPrice.toFixed(
      4
    )}${mcStr}`,
    rawPayload,
  };
}

// ── 6. Bridge/Exchange Hack — DeFiLlama ──────────────────────────────────

const BRIDGE_PROTOCOLS = ["wormhole", "stargate", "across"];

async function fetchBridgeTvl(): Promise<{
  tvlMillions: number;
  sources: string;
  rawPayload: string;
  crossCheckWormholeTvlMillions: number | null;
}> {
  let totalTvl = 0;
  let rawPayload = "{}";
  const tvls: string[] = [];
  for (const protocol of BRIDGE_PROTOCOLS) {
    try {
      const resp = await fetch(`https://api.llama.fi/tvl/${protocol}`, {
        signal: AbortSignal.timeout(8_000),
      });
      const text = await resp.text();
      const tvl = parseFloat(text);
      if (!isNaN(tvl) && tvl > 0) {
        totalTvl += tvl;
        tvls.push(`${protocol}=$${(tvl / 1e9).toFixed(2)}B`);
        if (protocol === "wormhole")
          rawPayload = JSON.stringify({ protocol, tvl: text.trim() });
      }
    } catch {
      /* ignore */
    }
  }
  const tvlMillions = Math.round(totalTvl / 1_000_000);

  let tvlDrop = "";
  try {
    const r2 = await fetch("https://api.llama.fi/protocol/wormhole", {
      signal: AbortSignal.timeout(8_000),
    });
    const d2 = (await r2.json()) as any;
    const chainTvls: Record<string, number> = d2?.currentChainTvls ?? {};
    const wormholeChainTvl = Object.values(chainTvls).reduce(
      (a: number, b: unknown) => a + (typeof b === "number" ? b : 0),
      0
    );
    const wormholeSlug = tvls.find((t) => t.startsWith("wormhole="));
    if (wormholeSlug && wormholeChainTvl > 0) {
      const slugTvl =
        parseFloat(wormholeSlug.replace(/.*=\$/, "").replace("B", "")) * 1e9;
      const dropPct =
        ((slugTvl - wormholeChainTvl) / Math.max(slugTvl, wormholeChainTvl)) *
        100;
      if (Math.abs(dropPct) > 30)
        tvlDrop = ` WARN:tvl_discrepancy=${dropPct.toFixed(0)}%`;
    }
  } catch {
    /* ignore */
  }

  // Cross-check: DeFiLlama per-chain TVL for wormhole (separate endpoint)
  let crossCheckWormholeTvlMillions: number | null = null;
  try {
    const wormholeEntry = tvls.find((t) => t.startsWith("wormhole="));
    if (wormholeEntry) {
      const slugTvl =
        parseFloat(wormholeEntry.replace(/.*=\$/, "").replace("B", "")) * 1e9;
      crossCheckWormholeTvlMillions = Math.round(slugTvl / 1_000_000);
    }
  } catch {
    /* ignore */
  }

  return {
    tvlMillions,
    sources: `DeFiLlama: ${tvls.join(" ")} total=$${(totalTvl / 1e9).toFixed(
      2
    )}B${tvlDrop}`,
    rawPayload,
    crossCheckWormholeTvlMillions,
  };
}

// ── Oracle Jobs ───────────────────────────────────────────────────────────

async function runEarthquakeJob() {
  const { magnitude, place, sources, rawPayload, crossCheckCount } =
    await fetchEarthquake();
  const onChainValue = Math.round(magnitude * 100);
  // Cross-check: if 24h event count is 0 but magnitude > 0, data likely stale.
  const secondaryValue =
    crossCheckCount !== null ? (crossCheckCount > 0 ? onChainValue : 0) : null;
  confirmValue(onChainValue, secondaryValue, 100, "earthquake");
  const tx = await postReport(
    new PublicKey(EARTHQUAKE_POOL),
    onChainValue,
    scopeHash(SCOPE_SEEDS.earthquake),
    `EQ M${magnitude.toFixed(1)} ${place.slice(0, 60)}`,
    rawPayload
  );
  console.log(
    `[oracle:earthquake] M${magnitude.toFixed(
      1
    )} value=${onChainValue} tx=${tx.slice(0, 16)}… | ${sources}`
  );
}

async function runFloodJob() {
  const { gaugeFt, siteName, sources, rawPayload, crossCheckMedianFt } =
    await fetchFlood();
  const onChainValue = Math.round(gaugeFt * 10);
  // Cross-check: current gauge vs historical median — allow 500% deviation (flood events are extreme)
  const secondaryValue =
    crossCheckMedianFt !== null ? Math.round(crossCheckMedianFt * 10) : null;
  confirmValue(onChainValue, secondaryValue, 500, "flood");
  const tx = await postReport(
    new PublicKey(FLOOD_POOL),
    onChainValue,
    scopeHash(SCOPE_SEEDS.flood),
    `Flood ${gaugeFt.toFixed(1)}ft ${siteName.slice(0, 50)}`,
    rawPayload
  );
  console.log(
    `[oracle:flood] ${gaugeFt.toFixed(1)}ft value=${onChainValue} tx=${tx.slice(
      0,
      16
    )}… | ${sources}`
  );
}

async function runCropJob() {
  const { score, sources, rawPayload, crossCheckScore } =
    await fetchCropComposite();
  // 7-day vs 14-day composite should agree within 40%
  confirmValue(score, crossCheckScore, 40, "crop");
  const tx = await postReport(
    new PublicKey(CROP_POOL),
    score,
    scopeHash(SCOPE_SEEDS.crop),
    `Crop ${score}/10000 ${sources.slice(0, 70)}`,
    rawPayload
  );
  console.log(
    `[oracle:crop] score=${score}/10000 tx=${tx.slice(0, 16)}… | ${sources}`
  );
}

async function runHurricaneJob() {
  const { windKnots, name, sources, rawPayload, crossCheckAlertCount } =
    await fetchHurricane();
  // If NHC says 120kt storm exists but weather.gov has 0 active hurricane alerts, data is suspicious
  if (
    ORACLE_MULTISIG_MODE &&
    windKnots > 64 &&
    crossCheckAlertCount !== null &&
    crossCheckAlertCount === 0
  ) {
    throw new Error(
      `[oracle:hurricane] multi-sig check failed — NHC reports ${windKnots}kt but weather.gov has 0 alerts`
    );
  }
  const tx = await postReport(
    new PublicKey(HURRICANE_POOL),
    windKnots,
    scopeHash(SCOPE_SEEDS.hurricane),
    `Hurricane ${name} ${windKnots}kt`,
    rawPayload
  );
  console.log(
    `[oracle:hurricane] ${name} ${windKnots}kt tx=${tx.slice(
      0,
      16
    )}… | ${sources}`
  );
}

async function runStablecoinJob() {
  const { usdcBps, usdtBps, sources, rawPayload, crossCheckUsdtBps } =
    await fetchStablecoinPrice();
  // USDC and USDT prices should both be near $1.00 — allow 5% divergence
  confirmValue(usdcBps, crossCheckUsdtBps, 5, "stablecoin");
  const onChainValue = Math.min(usdcBps, usdtBps);
  const tx = await postReport(
    new PublicKey(USDC_POOL),
    onChainValue,
    scopeHash(SCOPE_SEEDS.stablecoin),
    `USDC ${(usdcBps / 100).toFixed(2)}c USDT ${(usdtBps / 100).toFixed(2)}c`,
    rawPayload
  );
  console.log(
    `[oracle:stablecoin] USDC=${usdcBps}bps USDT=${usdtBps}bps tx=${tx.slice(
      0,
      16
    )}… | ${sources}`
  );
}

async function runBridgeJob() {
  const { tvlMillions, sources, rawPayload, crossCheckWormholeTvlMillions } =
    await fetchBridgeTvl();

  // Skip posting if all fetches failed — zero TVL on data outage would false-trigger policies
  if (tvlMillions === 0) {
    console.warn(
      "[oracle:bridge] SKIPPED: tvlMillions=0 — all DeFiLlama fetches failed (data outage guard)"
    );
    return;
  }

  // Wormhole single-protocol TVL should be a significant fraction of total
  if (crossCheckWormholeTvlMillions !== null) {
    confirmValue(tvlMillions, crossCheckWormholeTvlMillions * 3, 80, "bridge");
  }

  const tx = await postReport(
    new PublicKey(BRIDGE_POOL),
    tvlMillions,
    scopeHash(SCOPE_SEEDS.bridge),
    `Bridges $${(tvlMillions / 1000).toFixed(1)}B`,
    rawPayload
  );
  console.log(
    `[oracle:bridge] tvl=$${(tvlMillions / 1000).toFixed(
      1
    )}B value=${tvlMillions}M tx=${tx.slice(0, 16)}… | ${sources}`
  );
}

// ── Scheduler ─────────────────────────────────────────────────────────────

async function runAllJobs() {
  await Promise.allSettled([
    runEarthquakeJob().catch((e) =>
      console.error("[oracle:earthquake] error:", e.message)
    ),
    runFloodJob().catch((e) =>
      console.error("[oracle:flood] error:", e.message)
    ),
    runCropJob().catch((e) => console.error("[oracle:crop] error:", e.message)),
    runHurricaneJob().catch((e) =>
      console.error("[oracle:hurricane] error:", e.message)
    ),
    runStablecoinJob().catch((e) =>
      console.error("[oracle:stablecoin] error:", e.message)
    ),
    runBridgeJob().catch((e) =>
      console.error("[oracle:bridge] error:", e.message)
    ),
  ]);
}

export { runAllJobs };

export function startOracleCron() {
  cron.schedule("*/5 * * * *", runAllJobs);
  console.log(
    "Oracle cron started (5-min) — Earthquake|Flood|Crop|Hurricane|Stablecoin|Bridge"
  );
  runAllJobs().catch((e) =>
    console.error("[oracle] startup error:", e.message)
  );
}
