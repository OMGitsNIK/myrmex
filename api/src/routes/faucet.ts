import { Router } from "express";
import {
  createAssociatedTokenAccountIdempotent,
  transfer,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const router = Router();

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey("HM4vdUJGhAbD44G1CDQ7gx6HFUTvaoCgxtkNPXNfP9jo");
// Pre-funded ATA owned by oracle keypair — holds 50,000 USDC for demo faucet
const FAUCET_SOURCE_ATA = new PublicKey("APUcuAeoBZc4ozW2fDCVz9QvWMMUFFzJU46k671Cvakx");
const FAUCET_AMOUNT = 1_000_000_000; // 1000 USDC

function loadOracleKeypair(): Keypair {
  if (process.env.ORACLE_KEYPAIR_JSON) {
    return Keypair.fromSecretKey(
      Buffer.from(JSON.parse(process.env.ORACLE_KEYPAIR_JSON))
    );
  }
  const keyPath = path.join(process.env.HOME || "~", ".config/solana/oracle.json");
  if (fs.existsSync(keyPath)) {
    return Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync(keyPath, "utf-8")))
    );
  }
  return Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(
      path.join(process.env.HOME || "~", ".config/solana/id.json"), "utf-8"
    )))
  );
}

// POST /api/faucet  { wallet: "<pubkey>" }
// Transfers 100 devnet USDC from the pre-funded oracle ATA to the given wallet.
// Only works when ALLOW_SIMULATE=true.
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
    const oracle = loadOracleKeypair();

    const destAta = await createAssociatedTokenAccountIdempotent(
      connection,
      oracle,
      USDC_MINT,
      walletPk
    );

    const sig = await transfer(
      connection,
      oracle,
      FAUCET_SOURCE_ATA,
      destAta,
      oracle,
      FAUCET_AMOUNT
    );

    res.json({ success: true, amount_usdc: 1000, ata: destAta.toBase58(), tx: sig });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as faucetRouter };
