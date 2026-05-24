"use client";

import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import idl from "@/idl/myrmex.json";
import { POOL_BY_TYPE, PROGRAM_ID } from "@/lib/constants";

const V2_POOL_NAMES: Record<number, string> = {
  0: "Earthquake-Pacific",
  1: "Flood-US-Rivers",
  2: "Crop-MultiF",
  3: "Hurricane-Gulf",
  4: "USDC-Depeg",
  5: "Bridge-Hack",
};

// Read-only stub wallet so we can build an AnchorProvider without a connected user.
// The Program object only uses this for txs; account fetches go through Connection.
class ReadOnlyWallet implements Wallet {
  payer = Keypair.generate();
  publicKey = this.payer.publicKey;
  async signTransaction<T extends Transaction | VersionedTransaction>(
    _tx: T
  ): Promise<T> {
    throw new Error("Read-only wallet cannot sign transactions");
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    _txs: T[]
  ): Promise<T[]> {
    throw new Error("Read-only wallet cannot sign transactions");
  }
}

export function getReadOnlyProgram(connection: Connection): Program {
  const provider = new AnchorProvider(connection, new ReadOnlyWallet(), {
    commitment: "confirmed",
  });
  return new Program(idl as any, provider);
}

const CANONICAL_POOLS = new Set(Object.values(POOL_BY_TYPE));

export interface OnChainPool {
  pubkey: string;
  poolType: number;
  poolName: string;
  totalLiquidity: number;
  totalLocked: number;
  available: number;
  utilizationPct: string;
  estimatedApy: string;
  activePolicies: number;
  isActive: boolean;
  vault: string;
  usdcMint: string;
  lpTokenMint: string;
  juniorLiquidity: number;
  mezzanineLiquidity: number;
  seniorLiquidity: number;
  reserveBalance: number;
  poolConfig: {
    pubkey: string;
    oracleAuthority: string;
    minPremiumBps: number;
    maxCoverageBps: number;
    reserveBalance: number;
    demoMode: boolean;
  } | null;
}

// Mirror of api/src/routes/pools.ts — keeps response shape identical so existing
// UI components don't need to know which path served the data.
export async function fetchPoolsOnChain(
  connection: Connection
): Promise<OnChainPool[]> {
  const program = getReadOnlyProgram(connection);
  const allPools = await (program as any).account.riskPool.all();

  const filtered = allPools.filter(({ publicKey }: any) =>
    CANONICAL_POOLS.has(publicKey.toBase58())
  );

  const results = await Promise.all(
    filtered.map(async ({ publicKey, account }: any) => {
      const acc = account;
      const totalLiquidity = acc.totalLiquidity.toNumber();
      const totalLocked = acc.totalLocked.toNumber();
      const available = totalLiquidity - totalLocked;
      const utilization =
        totalLiquidity > 0 ? (totalLocked / totalLiquidity) * 100 : 0;
      const premiumAccrued = acc.premiumAccrued.toNumber();
      const estimatedApy =
        available > 0
          ? ((premiumAccrued / available) * 365 * 100).toFixed(2)
          : "0.00";

      const [poolConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool_config"), publicKey.toBuffer()],
        PROGRAM_ID
      );
      let poolConfig: OnChainPool["poolConfig"] = null;
      let reserveBalance = 0;
      try {
        const cfg: any = await (program as any).account.poolConfig.fetch(
          poolConfigPda
        );
        reserveBalance = cfg.reserveBalance?.toNumber() ?? 0;
        poolConfig = {
          pubkey: poolConfigPda.toBase58(),
          oracleAuthority: cfg.oracleAuthority.toBase58(),
          minPremiumBps:
            typeof cfg.minPremiumBps?.toNumber === "function"
              ? cfg.minPremiumBps.toNumber()
              : Number(cfg.minPremiumBps ?? 0),
          maxCoverageBps:
            typeof cfg.maxCoverageBps?.toNumber === "function"
              ? cfg.maxCoverageBps.toNumber()
              : Number(cfg.maxCoverageBps ?? 0),
          reserveBalance,
          demoMode: cfg.demoMode ?? true,
        };
      } catch {
        return null;
      }

      return {
        pubkey: publicKey.toBase58(),
        poolType: acc.poolType,
        poolName:
          V2_POOL_NAMES[acc.poolType] ??
          Buffer.from(acc.poolName)
            .toString("utf8")
            .replace(/\0/g, "")
            .trim(),
        totalLiquidity,
        totalLocked,
        available,
        utilizationPct: utilization.toFixed(2),
        estimatedApy,
        activePolicies: acc.activePolicyCount.toNumber(),
        isActive: acc.isActive,
        vault: acc.vault.toBase58(),
        usdcMint: acc.usdcMint.toBase58(),
        lpTokenMint: acc.lpTokenMint.toBase58(),
        juniorLiquidity: acc.juniorLiquidity?.toNumber?.() ?? 0,
        mezzanineLiquidity: acc.mezzanineLiquidity?.toNumber?.() ?? 0,
        seniorLiquidity: acc.seniorLiquidity?.toNumber?.() ?? 0,
        reserveBalance,
        poolConfig,
      } as OnChainPool;
    })
  );

  return results.filter((p): p is OnChainPool => p !== null);
}

export interface OnChainPolicy {
  pubkey: string;
  account: {
    policyholder: string;
    pool: string;
    coverageType: number;
    payoutAmount: number;
    premiumAmount: number;
    triggerCondition: {
      oraclePubkey: string;
      scopeHash: number[];
      threshold: number;
      comparison: number;
    };
    expiresAt: number;
    createdAt: number;
    isActive: boolean;
    isClaimed: boolean;
    bump: number;
  };
}

// Mirror of api/src/routes/policies.ts — memcmp filter at offset 8 on policyholder.
export async function fetchPoliciesOnChain(
  connection: Connection,
  wallet: PublicKey
): Promise<OnChainPolicy[]> {
  const program = getReadOnlyProgram(connection);
  const raw = await connection.getProgramAccounts(program.programId, {
    filters: [{ memcmp: { offset: 8, bytes: wallet.toBase58() } }],
  });

  const results: OnChainPolicy[] = [];
  for (const { pubkey, account } of raw) {
    try {
      const decoded: any = (program as any).coder.accounts.decode(
        "policyVault",
        account.data
      );
      results.push({
        pubkey: pubkey.toBase58(),
        account: {
          policyholder: decoded.policyholder.toBase58(),
          pool: decoded.pool.toBase58(),
          coverageType: decoded.coverageType,
          payoutAmount: decoded.payoutAmount.toNumber(),
          premiumAmount: decoded.premiumAmount.toNumber(),
          triggerCondition: {
            oraclePubkey: decoded.triggerCondition.oraclePubkey.toBase58(),
            scopeHash: Array.from(decoded.triggerCondition.scopeHash),
            threshold:
              typeof decoded.triggerCondition.threshold?.toNumber === "function"
                ? decoded.triggerCondition.threshold.toNumber()
                : Number(decoded.triggerCondition.threshold),
            comparison: decoded.triggerCondition.comparison,
          },
          expiresAt: decoded.expiresAt.toNumber(),
          createdAt: decoded.createdAt.toNumber(),
          isActive: decoded.isActive,
          isClaimed: decoded.isClaimed,
          bump: decoded.bump,
        },
      });
    } catch {
      // Old-format / unrelated accounts under the program — skip silently.
    }
  }
  return results;
}

// Wrap a fetch with a hard timeout so a hung API doesn't block fallback.
export async function fetchWithTimeout(
  url: string,
  ms: number,
  init?: RequestInit
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
