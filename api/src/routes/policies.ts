import { Router } from "express";
import { PublicKey } from "@solana/web3.js";
import { getAnchorProgram } from "../services/anchor.service";

const router = Router();

// New PolicyVault = 8 (disc) + 181 (data) = 189 bytes. Skip old 149-byte accounts.
const NEW_POLICY_VAULT_SIZE = 189;

// GET /api/policies/:wallet
router.get("/:wallet", async (req, res) => {
  try {
    const { program, connection } = getAnchorProgram();
    const wallet = new PublicKey(req.params.wallet);

    const rawAccounts = await connection.getProgramAccounts(program.programId, {
      filters: [
        { dataSize: NEW_POLICY_VAULT_SIZE },
        { memcmp: { offset: 8, bytes: wallet.toBase58() } },
      ],
    });

    const results: any[] = [];
    for (const { pubkey, account } of rawAccounts) {
      try {
        const decoded = (program as any).coder.accounts.decode(
          "policyVault",
          account.data
        );
        const acc = decoded as any;
        results.push({
          pubkey: pubkey.toBase58(),
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
      } catch {
        // Skip accounts that fail deserialization (old format, corrupted, etc.)
      }
    }

    res.json(results);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as policyRouter };
