import { Router } from "express";
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

// POST /api/simulate-trigger
// Demo endpoint: triggers a payout for judges
router.post("/", async (req, res) => {
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

    const pool = policyAccount.pool as PublicKey;
    const poolAccount = (await (program as any).account.riskPool.fetch(pool)) as any;
    const policyholder = policyAccount.policyholder as PublicKey;
    const oraclePubkey = policyAccount.triggerCondition.oraclePubkey as PublicKey;
    const usdcMint = poolAccount.usdcMint as PublicKey;

    const policyholderUsdc = getAssociatedTokenAddressSync(
      usdcMint,
      policyholder,
      false
    );
    const poolVault = poolAccount.vault as PublicKey;

    const payoutTx = await program.methods
      .triggerPayout(new anchor.BN(oracle_value))
      .accounts({
        caller: provider.wallet.publicKey,
        policy: policyPk,
        pool,
        policyholderUsdc,
        oracleAccount: oraclePubkey,
        poolVault,
        policyholder,
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

export { router as simulateRouter };
