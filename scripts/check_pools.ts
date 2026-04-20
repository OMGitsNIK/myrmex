import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

async function main() {
  const admin = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(
      JSON.parse(
        fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8")
      )
    )
  );
  const connection = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(__dirname + "/../target/idl/myrmex.json", "utf-8")
  );
  const program = new anchor.Program(idl, provider);

  for (const type of [0, 1, 3]) {
    const [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), admin.publicKey.toBuffer(), Buffer.from([type])],
      PROGRAM_ID
    );
    try {
      const acc: any = await (program.account as any).riskPool.fetch(poolPda);
      console.log(`Pool type ${type}: ${poolPda.toBase58()}`);
      console.log(`  usdc_mint:  ${acc.usdcMint.toBase58()}`);
      console.log(`  lp_token_mint: ${acc.lpTokenMint.toBase58()}`);
      console.log(`  vault:      ${acc.vault.toBase58()}`);
      console.log(`  total_tvl:  ${Number(acc.totalTvl) / 1e6} USDC`);
      console.log(`  is_active:  ${acc.isActive}`);
    } catch (e: any) {
      console.log(
        `Pool type ${type}: NOT INITIALIZED (${e.message?.slice(0, 80)})`
      );
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
