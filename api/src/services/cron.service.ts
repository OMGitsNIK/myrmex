import cron from "node-cron";
import { PublicKey } from "@solana/web3.js";
import { getAnchorProgram } from "./anchor.service";

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

// 8-byte Anchor discriminator for PolicyVault — sha256("account:PolicyVault")[0..8]
const POLICY_VAULT_DISCRIMINATOR = Buffer.from([
  190, 14, 42, 53, 55, 50, 185, 198,
]);

async function expireStalePolices() {
  const { program, provider } = getAnchorProgram();
  const connection = provider.connection;
  const now = Math.floor(Date.now() / 1000);

  // Fetch raw accounts and decode individually — bulk .all() throws if ANY account
  // has a stale layout (e.g. old devnet accounts created before oracle_pubkey was
  // added to TriggerCondition). Per-account decoding lets us skip malformed ones.
  const rawAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: POLICY_VAULT_DISCRIMINATOR.toString("base64"),
        },
      },
    ],
    encoding: "base64",
  });

  let expired = 0;
  let skipped = 0;

  for (const { pubkey, account } of rawAccounts) {
    let decoded: any;
    try {
      decoded = (program as any).coder.accounts.decode(
        "policyVault",
        account.data
      );
    } catch {
      skipped++;
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
      } catch (e) {
        console.error(`[cron] Failed to expire ${pubkey.toBase58()}:`, e);
      }
    }
  }

  if (skipped > 0) {
    console.warn(
      `[cron] Skipped ${skipped} malformed account(s) — stale devnet data`
    );
  }
  if (expired > 0) {
    console.log(`[cron] Expired ${expired} polic(ies) this cycle`);
  }
}

export function startCron() {
  cron.schedule("*/10 * * * *", async () => {
    try {
      await expireStalePolices();
    } catch (e) {
      console.error("[cron] Expiry sweep failed:", e);
    }
  });
  console.log("Policy expiry cron started (every 10 minutes)");
}
