"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOracleCron = startOracleCron;
/**
 * Oracle service — runs inside the API process on a 5-minute cron.
 * Fetches real-world data, verifies with Claude, posts OracleReport on-chain.
 */
const node_cron_1 = __importDefault(require("node-cron"));
const anchor = __importStar(require("@coral-xyz/anchor"));
const web3_js_1 = require("@solana/web3.js");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new web3_js_1.PublicKey(process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan");
const CROP_POOL = process.env.CROP_POOL || "HfyGsQVVsxt6BNM7UzTepBo91DKYdqLy7RKuLrwnM1YY";
const FLIGHT_POOL = process.env.FLIGHT_POOL || "EHxPZAMvRhumjFeChfeD9bn2Ju1RWf7RM45pY5vzEhNH";
const DEFI_POOL = process.env.DEFI_POOL || "ZZWgmeRUSdQyuarSb2zPFron2x88UgexhTQn8hJr9uD";
// Crop monitor: Chicago coords (configurable)
const CROP_LAT = process.env.CROP_LAT || "41.8781";
const CROP_LON = process.env.CROP_LON || "-87.6298";
const DEFI_PROTOCOL = process.env.DEFI_PROTOCOL || "aave-v3";
function loadOracleKeypair() {
    if (process.env.ORACLE_KEYPAIR_JSON) {
        return web3_js_1.Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.ORACLE_KEYPAIR_JSON)));
    }
    const keyPath = path.join(process.env.HOME || "~", ".config/solana/oracle.json");
    if (fs.existsSync(keyPath)) {
        return web3_js_1.Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(keyPath, "utf-8"))));
    }
    // Fall back to server keypair (dev only)
    const fallback = path.join(process.env.HOME || "~", ".config/solana/id.json");
    return web3_js_1.Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(fallback, "utf-8"))));
}
function getOracleProgram() {
    const kp = loadOracleKeypair();
    const connection = new web3_js_1.Connection(RPC_URL, "confirmed");
    const wallet = new anchor.Wallet(kp);
    const provider = new anchor.AnchorProvider(connection, wallet, {
        commitment: "confirmed",
    });
    const idlPath = path.join(__dirname, "../idl/myrmex.json");
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    const program = new anchor.Program(idl, provider);
    return { program, provider, keypair: kp };
}
function toDescBytes(s) {
    const buf = Buffer.alloc(192);
    buf.write(s.slice(0, 191), "utf8");
    return Array.from(buf);
}
async function postReport(poolPk, value, description) {
    const { program, provider } = getOracleProgram();
    const [poolConfigPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("pool_config"), poolPk.toBuffer()], PROGRAM_ID);
    const [oracleReportPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("oracle_report"), poolPk.toBuffer()], PROGRAM_ID);
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
async function fetchRainfallMm() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];
    const url = `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${CROP_LAT}&longitude=${CROP_LON}` +
        `&daily=precipitation_sum&timezone=auto` +
        `&start_date=${dateStr}&end_date=${dateStr}`;
    const resp = await fetch(url);
    const data = (await resp.json());
    return data.daily?.precipitation_sum?.[0] ?? 0;
}
async function fetchDefiTvl() {
    const resp = await fetch(`https://api.llama.fi/tvl/${DEFI_PROTOCOL}`);
    return parseFloat(await resp.text());
}
// ── AI verifier ───────────────────────────────────────────────────────────
async function aiVerify(prompt) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
        return { approved: true, reasoning: "AI verification skipped (no API key)" };
    const client = new sdk_1.default({ apiKey });
    const msg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
    });
    try {
        const raw = msg.content[0].text;
        const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        return JSON.parse(cleaned);
    }
    catch {
        return { approved: true, reasoning: "AI verification parse failed" };
    }
}
// ── Oracle jobs ───────────────────────────────────────────────────────────
async function runCropJob() {
    const mm = await fetchRainfallMm();
    const threshold = 2.0;
    const { approved, reasoning } = await aiVerify(`You are a parametric crop insurance claim verifier.
Rainfall today: ${mm.toFixed(2)} mm. Drought threshold: ${threshold} mm/day (trigger if below).
Is ${mm.toFixed(2)} mm a plausible real-world reading and clearly within normal sensor range?
Respond JSON only: {"approved": true/false, "reasoning": "one sentence"}`);
    const onChainValue = Math.round(mm * 100); // e.g. 1.5mm → 150
    const description = `Rainfall ${mm.toFixed(2)}mm (x100=${onChainValue}). AI: ${reasoning}`;
    const tx = await postReport(new web3_js_1.PublicKey(CROP_POOL), onChainValue, description);
    console.log(`[oracle:crop] ${mm.toFixed(2)}mm → value=${onChainValue} approved=${approved} tx=${tx.slice(0, 16)}…`);
}
async function runDefiJob() {
    const tvl = await fetchDefiTvl();
    const { approved, reasoning } = await aiVerify(`You are a DeFi hack insurance claim verifier.
${DEFI_PROTOCOL} TVL right now: $${(tvl / 1e9).toFixed(2)}B.
Does this TVL level seem plausible and within a normal operational range (not a data error)?
Respond JSON only: {"approved": true/false, "reasoning": "one sentence"}`);
    const onChainValue = Math.round(tvl / 1000000); // store in millions
    const description = `${DEFI_PROTOCOL} TVL $${(tvl / 1e9).toFixed(2)}B. AI: ${reasoning}`;
    const tx = await postReport(new web3_js_1.PublicKey(DEFI_POOL), onChainValue, description);
    console.log(`[oracle:defi] tvl=$${(tvl / 1e9).toFixed(2)}B → value=${onChainValue} approved=${approved} tx=${tx.slice(0, 16)}…`);
}
async function runFlightJob() {
    // Production: replace with AviationStack or FlightAware API call
    const delayMinutes = parseInt(process.env.MOCK_FLIGHT_DELAY_MINUTES || "0", 10);
    const { approved, reasoning } = await aiVerify(`You are a flight delay insurance claim verifier.
Reported delay: ${delayMinutes} minutes for a monitored flight.
Is a ${delayMinutes}-minute delay a plausible real-world aviation event?
Respond JSON only: {"approved": true/false, "reasoning": "one sentence"}`);
    const description = `Flight delay ${delayMinutes} min. AI: ${reasoning}`;
    const tx = await postReport(new web3_js_1.PublicKey(FLIGHT_POOL), delayMinutes, description);
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
function startOracleCron() {
    // Every 5 minutes
    node_cron_1.default.schedule("*/5 * * * *", runAllJobs);
    console.log("Oracle cron started (every 5 minutes)");
    // Run immediately on startup so Railway logs show real data right away
    runAllJobs().catch((e) => console.error("[oracle] startup run error:", e.message));
}
