import { Router } from "express";
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";

function toDescriptionBytes(s: string): number[] {
  const buf = Buffer.alloc(192);
  buf.write(s.slice(0, 191), "utf8");
  return Array.from(buf);
}

function loadOracleKeypair(): Keypair {
  // Railway: ORACLE_KEYPAIR_JSON env var (JSON byte array)
  if (process.env.ORACLE_KEYPAIR_JSON) {
    return Keypair.fromSecretKey(
      Buffer.from(JSON.parse(process.env.ORACLE_KEYPAIR_JSON))
    );
  }
  // Local dev: oracle.json file
  const keyPath =
    process.env.ORACLE_KEYPAIR_PATH ||
    path.join(process.env.HOME || "~", ".config/solana/oracle.json");
  if (fs.existsSync(keyPath)) {
    return Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync(keyPath, "utf-8")))
    );
  }
  // Fall back to main server keypair (dev only)
  const fallbackPath = path.join(process.env.HOME || "~", ".config/solana/id.json");
  return Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(fallbackPath, "utf-8")))
  );
}

function getOracleProgram() {
  const oracleKp = loadOracleKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(oracleKp);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const idlPath = path.join(__dirname, "../idl/myrmex.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new anchor.Program(idl, provider);
  return { program, provider };
}

// POST /api/simulate-trigger
// Dev/demo only — disabled in production unless ALLOW_SIMULATE=true is explicitly set.
router.post("/", async (req, res) => {
  if (process.env.ALLOW_SIMULATE !== "true") {
    return res.status(403).json({ error: "simulate-trigger is disabled in production" });
  }
  try {
    const { policy: policyPubkeyStr, oracle_value } = req.body as {
      policy: string;
      oracle_value: number;
    };

    const { program, provider } = getAnchorProgram();
    const policyPk = new PublicKey(policyPubkeyStr);
    const policyAccount = (await (program as any).account.policyVault.fetch(
      policyPk
    )) as any;

    const poolPk = policyAccount.pool as PublicKey;
    const poolAccount = (await (program as any).account.riskPool.fetch(
      poolPk
    )) as any;

    const policyholder = policyAccount.policyholder as PublicKey;
    const usdcMint = poolAccount.usdcMint as PublicKey;

    const policyholderUsdc = getAssociatedTokenAddressSync(
      usdcMint,
      policyholder,
      false
    );

    const [poolConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool_config"), poolPk.toBuffer()],
      PROGRAM_ID
    );
    const scopeHash = Buffer.from(policyAccount.triggerCondition.scopeHash);
    const [oracleReportPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("oracle_report"), poolPk.toBuffer(), scopeHash],
      PROGRAM_ID
    );

    const description = toDescriptionBytes(
      `Simulated event: value=${oracle_value}`
    );

    // Step 1: post oracle report — signed by oracle keypair
    const { program: oracleProgram, provider: oracleProvider } = getOracleProgram();
    await oracleProgram.methods
      .postOracleReport(new anchor.BN(oracle_value), Array.from(scopeHash), description)
      .accounts({
        oracleAuthority: oracleProvider.wallet.publicKey,
        pool: poolPk,
        poolConfig: poolConfigPda,
        oracleReport: oracleReportPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Step 2: trigger payout (permissionless — anyone can call)
    const payoutTx = await program.methods
      .triggerPayout()
      .accounts({
        caller: provider.wallet.publicKey,
        policy: policyPk,
        pool: poolPk,
        poolConfig: poolConfigPda,
        oracleReport: oracleReportPda,
        policyholderUsdc,
        poolVault: poolAccount.vault as PublicKey,
        policyholder,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    res.json({
      success: true,
      payout_tx: payoutTx,
      oracle_value,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/simulate-trigger/oracle-value/:policy
// Returns the oracle value needed to trigger the given policy's condition.
router.get("/oracle-value/:policy", async (req, res) => {
  try {
    const { program } = getAnchorProgram();
    const policyPk = new PublicKey(req.params.policy);
    const policyAccount = (await (program as any).account.policyVault.fetch(
      policyPk
    )) as any;

    const threshold = policyAccount.triggerCondition.threshold.toNumber();
    const comparison = policyAccount.triggerCondition.comparison;

    // comparison: 0 = GreaterThan, 1 = LessThan
    const suggestedValue = comparison === 0 ? threshold + 50 : threshold - 10;

    res.json({
      threshold,
      comparison,
      suggestedValue,
      coverageType: policyAccount.coverageType,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as simulateRouter };
