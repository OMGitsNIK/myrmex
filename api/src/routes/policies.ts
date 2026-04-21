import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

// GET /api/policies/:wallet
router.get("/:wallet", async (req, res) => {
  try {
    const { program } = getAnchorProgram();
    const wallet = new PublicKey(req.params.wallet);

    const policies = await (program as any).account.policyVault.all([
      {
        memcmp: {
          offset: 8, // after discriminator
          bytes: wallet.toBase58(),
        },
      },
    ]);

    res.json(
      policies.map(({ publicKey, account }) => {
        const acc = account as any;
        return {
          pubkey: publicKey.toBase58(),
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
        };
      })
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as policyRouter };
