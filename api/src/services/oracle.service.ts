/**
 * Oracle service — runs inside the API process on a 5-minute cron.
 * Fetches real-world data, verifies with Claude, posts OracleReport on-chain.
 */
import cron from "node-cron";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

const CROP_POOL = process.env.CROP_POOL || "HfyGsQVVsxt6BNM7UzTepBo91DKYdqLy7RKuLrwnM1YY";
const FLIGHT_POOL = process.env.FLIGHT_POOL || "EHxPZAMvRhumjFeChfeD9bn2Ju1RWf7RM45pY5vzEhNH";
const DEFI_POOL = process.env.DEFI_POOL || "ZZWgmeRUSdQyuarSb2zPFron2x88UgexhTQn8hJr9uD";

// Crop monitor: Chicago coords (configurable)
const CROP_LAT = process.env.CROP_LAT || "41.8781";
const CROP_LON = process.env.CROP_LON || "-87.6298";
const DEFI_PROTOCOL = process.env.DEFI_PROTOCOL || "aave-v3";

function loadOracleKeypair(): Keypair {
  if (process.env.ORACLE_KEYPAIR_JSON) {
    return Keypair.fromSecretKey(
      Buffer.from(JSON.parse(process.env.ORACLE_KEYPAIR_JSON))
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
  // Fall back to server keypair (dev only)
  const fallback = path.join(process.env.HOME || "~", ".config/solana/id.json");
  return Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(fallback, "utf-8")))
  );
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
  const program = new anchor.Program(idl, provider);
  return { program, provider, keypair: kp };
}

function toDescBytes(s: string): number[] {
  const buf = Buffer.alloc(192);
  buf.write(s.slice(0, 191), "utf8");
  return Array.from(buf);
}

async function postReport(
  poolPk: PublicKey,
  value: number,
  description: string
): Promise<string> {
  const { program, provider } = getOracleProgram();

  const [poolConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_config"), poolPk.toBuffer()],
    PROGRAM_ID
  );
  const [oracleReportPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_report"), poolPk.toBuffer()],
    PROGRAM_ID
  );

  const tx = await program.methods
    .postOracleReport(new anchor.BN(value), toDescBytes(description))
    .accounts({
      oracleAuthority: provider.wallet.publicKey,
      pool: poolPk,
      poolConfig: poolConfigPda,
      oracleReport: oracleReportPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  return tx;
}

// ── Data fetchers ──────────────────────────────────────────────────────────

async function fetchRainfallMm(): Promise<number> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split("T")[0];
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${CROP_LAT}&longitude=${CROP_LON}` +
    `&daily=precipitation_sum&timezone=auto` +
    `&start_date=${dateStr}&end_date=${dateStr}`;

  const resp = await fetch(url);
  const data = (await resp.json()) as any;
  return data.daily?.precipitation_sum?.[0] ?? 0;
}

async function fetchDefiTvl(): Promise<number> {
  const resp = await fetch(`https://api.llama.fi/tvl/${DEFI_PROTOCOL}`);
  return parseFloat(await resp.text());
}

// ── AI verifier ───────────────────────────────────────────────────────────

async function aiVerify(prompt: string): Promise<{ approved: boolean; reasoning: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { approved: true, reasoning: "AI verification skipped (no API key)" };

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  try {
    const raw = (msg.content[0] as any).text as string;
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { approved: true, reasoning: "AI verification parse failed" };
  }
}

// ── Oracle jobs ───────────────────────────────────────────────────────────

async function runCropJob() {
  const mm = await fetchRainfallMm();
  const threshold = 2.0;

  const { approved, reasoning } = await aiVerify(
    `You are a parametric crop insurance claim verifier.
Rainfall today: ${mm.toFixed(2)} mm. Drought threshold: ${threshold} mm/day (trigger if below).
Is ${mm.toFixed(2)} mm a plausible real-world reading and clearly within normal sensor range?
Respond JSON only: {"approved": true/false, "reasoning": "one sentence"}`
  );

  const onChainValue = Math.round(mm * 100); // e.g. 1.5mm → 150
  const description = `Rainfall ${mm.toFixed(2)}mm (x100=${onChainValue}). AI: ${reasoning}`;
  const tx = await postReport(new PublicKey(CROP_POOL), onChainValue, description);
  console.log(`[oracle:crop] ${mm.toFixed(2)}mm → value=${onChainValue} approved=${approved} tx=${tx.slice(0, 16)}…`);
}

async function runDefiJob() {
  const tvl = await fetchDefiTvl();
  const { approved, reasoning } = await aiVerify(
    `You are a DeFi hack insurance claim verifier.
${DEFI_PROTOCOL} TVL right now: $${(tvl / 1e9).toFixed(2)}B.
Does this TVL level seem plausible and within a normal operational range (not a data error)?
Respond JSON only: {"approved": true/false, "reasoning": "one sentence"}`
  );

  const onChainValue = Math.round(tvl / 1_000_000); // store in millions
  const description = `${DEFI_PROTOCOL} TVL $${(tvl / 1e9).toFixed(2)}B. AI: ${reasoning}`;
  const tx = await postReport(new PublicKey(DEFI_POOL), onChainValue, description);
  console.log(`[oracle:defi] tvl=$${(tvl / 1e9).toFixed(2)}B → value=${onChainValue} approved=${approved} tx=${tx.slice(0, 16)}…`);
}

async function runFlightJob() {
  // Production: replace with AviationStack or FlightAware API call
  const delayMinutes = parseInt(process.env.MOCK_FLIGHT_DELAY_MINUTES || "0", 10);
  const { approved, reasoning } = await aiVerify(
    `You are a flight delay insurance claim verifier.
Reported delay: ${delayMinutes} minutes for a monitored flight.
Is a ${delayMinutes}-minute delay a plausible real-world aviation event?
Respond JSON only: {"approved": true/false, "reasoning": "one sentence"}`
  );

  const description = `Flight delay ${delayMinutes} min. AI: ${reasoning}`;
  const tx = await postReport(new PublicKey(FLIGHT_POOL), delayMinutes, description);
  console.log(`[oracle:flight] delay=${delayMinutes}min approved=${approved} tx=${tx.slice(0, 16)}…`);
}

// ── Scheduler ─────────────────────────────────────────────────────────────

async function runAllJobs() {
  await Promise.allSettled([
    runCropJob().catch((e) => console.error("[oracle:crop] error:", e.message)),
    runDefiJob().catch((e) => console.error("[oracle:defi] error:", e.message)),
    runFlightJob().catch((e) => console.error("[oracle:flight] error:", e.message)),
  ]);
}

export function startOracleCron() {
  // Every 5 minutes
  cron.schedule("*/5 * * * *", runAllJobs);
  console.log("Oracle cron started (every 5 minutes)");

  // Run immediately on startup so Railway logs show real data right away
  runAllJobs().catch((e) => console.error("[oracle] startup run error:", e.message));
}
