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
      policies.map(({ publicKey, account }) => ({
        pubkey: publicKey.toBase58(),
        account,
      }))
    );
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as policyRouter };
