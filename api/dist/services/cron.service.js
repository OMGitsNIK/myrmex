"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCron = startCron;
const node_cron_1 = __importDefault(require("node-cron"));
const anchor_service_1 = require("./anchor.service");
function startCron() {
    node_cron_1.default.schedule("*/10 * * * *", async () => {
        try {
            const { program, provider } = (0, anchor_service_1.getAnchorProgram)();
            const now = Math.floor(Date.now() / 1000);
            const policies = await program.account.policyVault.all();
            for (const { publicKey, account } of policies) {
                if (account.expiresAt.toNumber() < now && account.isActive) {
                    try {
                        await program.methods
                            .expirePolicy()
                            .accounts({
                            caller: provider.wallet.publicKey,
                            policy: publicKey,
                            pool: account.pool,
                        })
                            .rpc();
                        console.log(`Expired policy: ${publicKey.toBase58()}`);
                    }
                    catch (e) {
                        console.error(`Failed to expire ${publicKey.toBase58()}:`, e);
                    }
                }
            }
        }
        catch (e) {
            console.error("Cron error:", e);
        }
    });
    console.log("Policy expiry cron started (every 10 minutes)");
}
