import { Router } from "express";
import * as anchor from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotent,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const router = Router();

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey("HM4vdUJGhAbD44G1CDQ7gx6HFUTvaoCgxtkNPXNfP9jo");
const FAUCET_AMOUNT = 100_000_000; // 100 USDC (6 decimals)

function loadAdminKeypair(): Keypair {
  if (process.env.ORACLE_KEYPAIR_JSON) {
    return Keypair.fromSecretKey(
      Buffer.from(JSON.parse(process.env.ORACLE_KEYPAIR_JSON))
    );
  }
  if (process.env.SERVER_KEYPAIR) {
    return Keypair.fromSecretKey(
      Buffer.from(JSON.parse(process.env.SERVER_KEYPAIR))
    );
  }
  const fallback = path.join(process.env.HOME || "~", ".config/solana/id.json");
  return Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(fallback, "utf-8")))
  );
}

// POST /api/faucet  { wallet: "<pubkey>" }
// Mints 100 devnet USDC to the given wallet. Only works when ALLOW_SIMULATE=true.
router.post("/", async (req, res) => {
  if (process.env.ALLOW_SIMULATE !== "true") {
    return res.status(403).json({ error: "Faucet disabled in this environment" });
  }

  const { wallet } = req.body as { wallet?: string };
  if (!wallet) return res.status(400).json({ error: "wallet is required" });

  let walletPk: PublicKey;
  try {
    walletPk = new PublicKey(wallet);
  } catch {
    return res.status(400).json({ error: "Invalid wallet public key" });
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const admin = loadAdminKeypair();

    const ata = await createAssociatedTokenAccountIdempotent(
      connection,
      admin,
      USDC_MINT,
      walletPk
    );

    const sig = await mintTo(
      connection,
      admin,
      USDC_MINT,
      ata,
      admin,
      FAUCET_AMOUNT
    );

    res.json({
      success: true,
      amount_usdc: 100,
      ata: ata.toBase58(),
      tx: sig,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as faucetRouter };
