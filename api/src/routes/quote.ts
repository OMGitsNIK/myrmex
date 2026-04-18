import { Router } from "express";

const router = Router();

const PRICING_API = process.env.PRICING_API_URL || "http://localhost:8000";

// POST /api/quote — proxy to Python pricing service
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

    const data = await response.json();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export { router as quoteRouter };
