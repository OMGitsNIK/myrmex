"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCron = startCron;
const node_cron_1 = __importDefault(require("node-cron"));
const web3_js_1 = require("@solana/web3.js");
const anchor_service_1 = require("./anchor.service");
const PROGRAM_ID = new web3_js_1.PublicKey(process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan");
// Current on-chain PolicyVault account size in bytes.
// Stale devnet accounts from before oracle_pubkey was added to TriggerCondition
// are 149 bytes — fetching only 181-byte accounts skips them automatically.
const POLICY_VAULT_LEN = 181;
async function expireStalePolices() {
    const { program, provider } = (0, anchor_service_1.getAnchorProgram)();
    const connection = provider.connection;
    const now = Math.floor(Date.now() / 1000);
    // Filter by exact account size to skip stale devnet accounts that have a
    // different layout (149 bytes vs 181). Bulk .all() fails on any decode error.
    const rawAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [{ dataSize: POLICY_VAULT_LEN }],
    });
    let expired = 0;
    for (const { pubkey, account } of rawAccounts) {
        let decoded;
        try {
            decoded = program.coder.accounts.decode("policyVault", account.data);
        }
        catch {
            continue;
        }
        if (decoded.expiresAt.toNumber() < now && decoded.isActive) {
            try {
                await program.methods
                    .expirePolicy()
                    .accounts({
                    caller: provider.wallet.publicKey,
                    policy: pubkey,
                    pool: decoded.pool,
                })
                    .rpc();
                console.log(`[cron] Expired policy: ${pubkey.toBase58()}`);
                expired++;
            }
            catch (e) {
                console.error(`[cron] Failed to expire ${pubkey.toBase58()}:`, e);
            }
        }
    }
    if (expired > 0) {
        console.log(`[cron] Expired ${expired} polic(ies) this cycle`);
    }
}
let isRunning = false;
function startCron() {
    node_cron_1.default.schedule("*/10 * * * *", async () => {
        if (isRunning) {
            console.log("[cron] Previous sweep still running — skipping cycle");
            return;
        }
        isRunning = true;
        try {
            await expireStalePolices();
        }
        catch (e) {
            console.error("[cron] Expiry sweep failed:", e);
        }
        finally {
            isRunning = false;
        }
    });
    console.log("Policy expiry cron started (every 10 minutes)");
}
