/**
 * MYRMEX Devnet Setup
 * ───────────────────
 * Initializes all three risk pools on devnet and seeds them with USDC.
 * Creates a test USDC mint (devnet) and funds it from admin keypair.
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/setup-devnet.ts
 *
 * After running: copy printed NEXT_PUBLIC_USDC_MINT into app/.env.local
 * and redeploy to Vercel.
 */

import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

const POOLS = [
  { type: 0, name: "Flight-Global", seed: 2_000 },
  { type: 1, name: "Crop-Drought  ", seed: 2_000 },
  { type: 3, name: "DeFi-Hack     ", seed: 1_000 },
];

async function main() {
  const keypairPath =
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME || "~", ".config/solana/id.json");

  const admin = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );

  const connection = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../target/idl/myrmex.json"), "utf-8")
  );
  const program = new anchor.Program(idl, provider);

  const adminBal = await connection.getBalance(admin.publicKey);
  console.log("\nMYRMEX Devnet Setup");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Admin:  ", admin.publicKey.toBase58());
  console.log("Balance:", adminBal / 1e9, "SOL");

  if (adminBal < 0.5e9) {
    console.error("❌ Admin needs at least 0.5 SOL on devnet. Run:");
    console.error("   solana airdrop 2 --url devnet");
    process.exit(1);
  }

  // ─── 1. Create test USDC mint ──────────────────────────────────────────────
  console.log("\n1. Creating test USDC mint on devnet...");
  const usdcMint = await createMint(
    connection,
    admin,
    admin.publicKey,
    null,
    6
  );
  console.log("   ✓ USDC mint:", usdcMint.toBase58());

  // ─── 2. Create admin USDC ATA and mint seed capital ───────────────────────
  console.log("\n2. Minting seed USDC to admin...");
  const adminUsdcAta = await createAssociatedTokenAccount(
    connection,
    admin,
    usdcMint,
    admin.publicKey
  ).catch(() => getAssociatedTokenAddress(usdcMint, admin.publicKey));

  const totalSeedUsdc = POOLS.reduce((sum, p) => sum + p.seed, 0);
  await mintTo(
    connection,
    admin,
    usdcMint,
    adminUsdcAta,
    admin,
    BigInt(totalSeedUsdc) * BigInt(1_000_000)
  );
  console.log(`   ✓ Minted ${totalSeedUsdc} USDC to admin`);

  // ─── 3. Initialize each pool and seed it ──────────────────────────────────
  console.log("\n3. Initializing pools...");
  const results: any[] = [];

  for (const pool of POOLS) {
    const [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("pool"),
        admin.publicKey.toBuffer(),
        Buffer.from([pool.type]),
      ],
      PROGRAM_ID
    );
    const [lpMint] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lp_mint"), poolPda.toBuffer()],
      PROGRAM_ID
    );
    const poolVault = await getAssociatedTokenAddress(usdcMint, poolPda, true);

    const nameBytes = new Uint8Array(32);
    pool.name
      .trim()
      .split("")
      .forEach((c, i) => (nameBytes[i] = c.charCodeAt(0)));

    try {
      await (program as any).methods
        .initializePool(pool.type, Array.from(nameBytes))
        .accounts({
          authority: admin.publicKey,
          pool: poolPda,
          usdcMint,
          vault: poolVault,
          lpTokenMint: lpMint,
        })
        .rpc();
      console.log(
        `   ✓ Pool ${pool.name.trim()} initialized: ${poolPda.toBase58()}`
      );
    } catch (e: any) {
      if (e.message?.includes("already in use")) {
        console.log(`   ℹ Pool ${pool.name.trim()} already exists`);
      } else {
        throw e;
      }
    }

    // Seed with USDC
    const adminLpAta = await getAssociatedTokenAddress(lpMint, admin.publicKey);
    await (program as any).methods
      .fundPool(new anchor.BN(pool.seed * 1_000_000))
      .accounts({
        provider: admin.publicKey,
        pool: poolPda,
        providerUsdc: adminUsdcAta,
        poolVault,
        lpTokenMint: lpMint,
        providerLpTokens: adminLpAta,
      })
      .rpc();
    console.log(`   ✓ Seeded ${pool.seed} USDC into ${pool.name.trim()} pool`);

    results.push({ name: pool.name.trim(), poolPda, lpMint, poolVault });
  }

  // ─── 4. Summary ───────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Devnet setup complete!\n");
  console.log("Update app/.env.local with:");
  console.log(`  NEXT_PUBLIC_USDC_MINT=${usdcMint.toBase58()}`);
  console.log(`  NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com\n`);
  console.log("Pools on devnet:");
  results.forEach((r) => {
    console.log(`  ${r.name}: ${r.poolPda.toBase58()}`);
  });
  console.log(
    "\nAlso update this in Vercel env vars for the live site to show pools."
  );
}

main().catch((e) => {
  console.error("\n❌ Failed:", e.message);
  process.exit(1);
});
