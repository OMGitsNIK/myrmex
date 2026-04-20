import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID =
  process.env.PROGRAM_ID || "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan";

let _program: anchor.Program | null = null;
let _provider: anchor.AnchorProvider | null = null;

export function getAnchorProgram() {
  if (_program && _provider) return { program: _program, provider: _provider };

  const connection = new Connection(RPC_URL, "confirmed");

  let keypair: Keypair;
  if (process.env.SERVER_KEYPAIR) {
    keypair = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(process.env.SERVER_KEYPAIR))
    );
  } else {
    // Fall back to local default keypair
    const keyPath = path.join(
      process.env.HOME || "~",
      ".config/solana/id.json"
    );
    keypair = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync(keyPath, "utf-8")))
    );
  }

  const wallet = new anchor.Wallet(keypair);
  _provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(_provider);

  // Load IDL
  const idlPath = path.join(__dirname, "../../..", "target/idl/myrmex.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  _program = new anchor.Program(idl, _provider);

  return {
    program: _program,
    provider: _provider,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accounts: (_program as any).account as Record<string, any>,
  };
}
