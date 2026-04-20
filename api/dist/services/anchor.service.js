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
exports.getAnchorProgram = getAnchorProgram;
const anchor = __importStar(require("@coral-xyz/anchor"));
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan";
let _program = null;
let _provider = null;
function getAnchorProgram() {
    if (_program && _provider)
        return { program: _program, provider: _provider };
    const connection = new web3_js_1.Connection(RPC_URL, "confirmed");
    let keypair;
    if (process.env.SERVER_KEYPAIR) {
        keypair = web3_js_1.Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.SERVER_KEYPAIR)));
    }
    else {
        // Fall back to local default keypair
        const keyPath = path.join(process.env.HOME || "~", ".config/solana/id.json");
        keypair = web3_js_1.Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(keyPath, "utf-8"))));
    }
    const wallet = new anchor.Wallet(keypair);
    _provider = new anchor.AnchorProvider(connection, wallet, {
        commitment: "confirmed",
    });
    anchor.setProvider(_provider);
    // Load IDL
    const idlPath = path.join(__dirname, "../idl/myrmex.json");
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    _program = new anchor.Program(idl, _provider);
    return {
        program: _program,
        provider: _provider,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accounts: _program.account,
    };
}
