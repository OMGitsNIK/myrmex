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
exports.faucetRouter = void 0;
const express_1 = require("express");
const spl_token_1 = require("@solana/spl-token");
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const router = (0, express_1.Router)();
exports.faucetRouter = router;
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const USDC_MINT = new web3_js_1.PublicKey("HM4vdUJGhAbD44G1CDQ7gx6HFUTvaoCgxtkNPXNfP9jo");
const FAUCET_AMOUNT = 100000000; // 100 USDC (6 decimals)
function loadAdminKeypair() {
    if (process.env.ORACLE_KEYPAIR_JSON) {
        return web3_js_1.Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.ORACLE_KEYPAIR_JSON)));
    }
    if (process.env.SERVER_KEYPAIR) {
        return web3_js_1.Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.SERVER_KEYPAIR)));
    }
    const fallback = path.join(process.env.HOME || "~", ".config/solana/id.json");
    return web3_js_1.Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(fallback, "utf-8"))));
}
// POST /api/faucet  { wallet: "<pubkey>" }
// Mints 100 devnet USDC to the given wallet. Only works when ALLOW_SIMULATE=true.
router.post("/", async (req, res) => {
    if (process.env.ALLOW_SIMULATE !== "true") {
        return res.status(403).json({ error: "Faucet disabled in this environment" });
    }
    const { wallet } = req.body;
    if (!wallet)
        return res.status(400).json({ error: "wallet is required" });
    let walletPk;
    try {
        walletPk = new web3_js_1.PublicKey(wallet);
    }
    catch {
        return res.status(400).json({ error: "Invalid wallet public key" });
    }
    try {
        const connection = new web3_js_1.Connection(RPC_URL, "confirmed");
        const admin = loadAdminKeypair();
        const ata = await (0, spl_token_1.createAssociatedTokenAccountIdempotent)(connection, admin, USDC_MINT, walletPk);
        const sig = await (0, spl_token_1.mintTo)(connection, admin, USDC_MINT, ata, admin, FAUCET_AMOUNT);
        res.json({
            success: true,
            amount_usdc: 100,
            ata: ata.toBase58(),
            tx: sig,
        });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
