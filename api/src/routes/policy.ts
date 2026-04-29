import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

// GET /api/policy/:pubkey — fetch a single policy account by its address
router.get("/:pubkey", async (req, res) => {
  let pk: PublicKey;
  try {
    pk = new PublicKey(req.params.pubkey);
  } catch {
    return res.status(400).json({ error: "Invalid policy public key" });
  }
  try {
    const { program } = getAnchorProgram();
    const acc = (await (program as any).account.policyVault.fetch(pk)) as any;

    res.json({
      pubkey: pk.toBase58(),
      account: {
        policyholder: acc.policyholder.toBase58(),
        pool: acc.pool.toBase58(),
        coverageType: acc.coverageType,
        payoutAmount: acc.payoutAmount.toNumber(),
        premiumAmount: acc.premiumAmount.toNumber(),
        triggerCondition: {
          oraclePubkey: acc.triggerCondition.oraclePubkey.toBase58(),
          scopeHash: Array.from(acc.triggerCondition.scopeHash),
          threshold: acc.triggerCondition.threshold.toNumber(),
          comparison: acc.triggerCondition.comparison,
        },
        expiresAt: acc.expiresAt.toNumber(),
        createdAt: acc.createdAt.toNumber(),
        isActive: acc.isActive,
        isClaimed: acc.isClaimed,
        bump: acc.bump,
      },
    });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
  return;
});

export { router as policyByPubkeyRouter };
