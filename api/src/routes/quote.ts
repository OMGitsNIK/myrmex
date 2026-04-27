import { Router } from "express";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

const router = Router();

const PRICING_API = process.env.PRICING_API_URL || "http://localhost:8000";

// Load pricing authority keypair from env or use a static dev one
const PRICING_SK = process.env.PRICING_SECRET_KEY;
const pricingKeypair = PRICING_SK
  ? Keypair.fromSecretKey(bs58.decode(PRICING_SK))
  : Keypair.generate(); // fallback to random for demo if not set

if (!PRICING_SK) {
  console.log(
    "------------------------------------------------------------------"
  );
  console.log(
    "⚠ NO PRICING_SECRET_KEY FOUND IN ENV. GENERATING EPHEMERAL KEY:"
  );
  console.log("PRICING_AUTHORITY_PUBKEY:", pricingKeypair.publicKey.toBase58());
  console.log(
    "------------------------------------------------------------------"
  );
}

// POST /api/quote — proxy to Python pricing service & sign the result
router.post("/", async (req, res) => {
  try {
    const response = await fetch(`${PRICING_API}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const data = (await response.json()) as any;

    // Sign the quote for on-chain enforcement
    const expiry = Math.floor(Date.now() / 1000) + 300; // 5 minute validity

    // We'll pass these values to the program.
    // In this demo, we'll return a mock signature that the program can handle.
    // In production, you'd use nacl.sign.detached()
    const signature = new Uint8Array(64).fill(0);
    signature.set(pricingKeypair.publicKey.toBytes().slice(0, 32), 0);

    res.json({
      ...data,
      quote_signature: Array.from(signature),
      quote_expiry: expiry,
      pricing_authority: pricingKeypair.publicKey.toBase58(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as quoteRouter };
