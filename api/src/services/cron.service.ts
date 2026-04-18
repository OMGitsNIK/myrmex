import cron from "node-cron";
import { getAnchorProgram } from "./anchor.service";

export function startCron() {
  cron.schedule("*/10 * * * *", async () => {
    try {
      const { program, provider } = getAnchorProgram();
      const now = Math.floor(Date.now() / 1000);

      const policies = await (program as any).account.policyVault.all();

      for (const { publicKey, account } of policies as any[]) {
        if ((account.expiresAt as any).toNumber() < now && account.isActive) {
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
          } catch (e) {
            console.error(`Failed to expire ${publicKey.toBase58()}:`, e);
          }
        }
      }
    } catch (e) {
      console.error("Cron error:", e);
    }
  });
  console.log("Policy expiry cron started (every 10 minutes)");
}
