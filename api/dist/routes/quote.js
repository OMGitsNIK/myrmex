"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteRouter = void 0;
const express_1 = require("express");
const router = (0, express_1.Router)();
exports.quoteRouter = router;
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
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
