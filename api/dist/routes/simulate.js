"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulateRouter = void 0;
const express_1 = require("express");
const anchor = __importStar(require("@coral-xyz/anchor"));
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const anchor_service_1 = require("../services/anchor.service");
const router = (0, express_1.Router)();
exports.simulateRouter = router;
const PROGRAM_ID = new web3_js_1.PublicKey(process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan");
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
function toDescriptionBytes(s) {
    const buf = Buffer.alloc(192);
    buf.write(s.slice(0, 191), "utf8");
    return Array.from(buf);
}
function loadOracleKeypair() {
    // Railway: ORACLE_KEYPAIR_JSON env var (JSON byte array)
    if (process.env.ORACLE_KEYPAIR_JSON) {
        return web3_js_1.Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.ORACLE_KEYPAIR_JSON)));
    }
    // Local dev: oracle.json file
    const keyPath = process.env.ORACLE_KEYPAIR_PATH ||
        path.join(process.env.HOME || "~", ".config/solana/oracle.json");
    if (fs.existsSync(keyPath)) {
        return web3_js_1.Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(keyPath, "utf-8"))));
    }
    // Fall back to main server keypair (dev only)
    const fallbackPath = path.join(process.env.HOME || "~", ".config/solana/id.json");
    return web3_js_1.Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(fallbackPath, "utf-8"))));
}
function getOracleProgram() {
    const oracleKp = loadOracleKeypair();
    const connection = new web3_js_1.Connection(RPC_URL, "confirmed");
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
// Demo: posts an oracle report and triggers a payout.
// The server wallet must be configured as the oracle_authority for the pool.
router.post("/", async (req, res) => {
    try {
        const { policy: policyPubkeyStr, oracle_value } = req.body;
        const { program, provider } = (0, anchor_service_1.getAnchorProgram)();
        const policyPk = new web3_js_1.PublicKey(policyPubkeyStr);
        const policyAccount = (await program.account.policyVault.fetch(policyPk));
        const poolPk = policyAccount.pool;
        const poolAccount = (await program.account.riskPool.fetch(poolPk));
        const policyholder = policyAccount.policyholder;
        const usdcMint = poolAccount.usdcMint;
        const policyholderUsdc = (0, spl_token_1.getAssociatedTokenAddressSync)(usdcMint, policyholder, false);
        const [poolConfigPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("pool_config"), poolPk.toBuffer()], PROGRAM_ID);
        const [oracleReportPda] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("oracle_report"), poolPk.toBuffer()], PROGRAM_ID);
        const description = toDescriptionBytes(`Simulated event: value=${oracle_value}`);
        // Step 1: post oracle report — signed by oracle keypair
        const { program: oracleProgram, provider: oracleProvider } = getOracleProgram();
        await oracleProgram.methods
            .postOracleReport(new anchor.BN(oracle_value), description)
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
            poolVault: poolAccount.vault,
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
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// GET /api/simulate-trigger/oracle-value/:policy
// Returns the oracle value needed to trigger the given policy's condition.
router.get("/oracle-value/:policy", async (req, res) => {
    try {
        const { program } = (0, anchor_service_1.getAnchorProgram)();
        const policyPk = new web3_js_1.PublicKey(req.params.policy);
        const policyAccount = (await program.account.policyVault.fetch(policyPk));
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
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
