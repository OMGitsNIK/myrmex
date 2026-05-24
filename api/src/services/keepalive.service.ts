import cron from "node-cron";

// Render's free Web Service tier spins a container down after 15 minutes
// of no inbound traffic. This cron self-pings every 13 minutes so neither
// the api nor pricing ever goes cold. RENDER_EXTERNAL_URL is set by Render
// automatically; outside Render the cron simply no-ops.
export function startKeepAlive() {
  const apiUrl = process.env.RENDER_EXTERNAL_URL;
  const pricingUrl = process.env.PRICING_API_URL;

  if (!apiUrl && !pricingUrl) {
    console.log("[keepalive] No RENDER_EXTERNAL_URL or PRICING_API_URL — skipping");
    return;
  }

  cron.schedule("*/13 * * * *", async () => {
    const targets: string[] = [];
    if (apiUrl) targets.push(`${apiUrl.replace(/\/$/, "")}/health`);
    if (pricingUrl) targets.push(`${pricingUrl.replace(/\/$/, "")}/docs`);

    await Promise.allSettled(
      targets.map(async (url) => {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(url, { signal: ctrl.signal });
          clearTimeout(t);
          if (!res.ok) console.warn(`[keepalive] ${url} → ${res.status}`);
        } catch (e) {
          console.warn(`[keepalive] ${url} failed:`, (e as Error).message);
        }
      })
    );
  });

  console.log(
    `[keepalive] self-ping every 13min (api=${!!apiUrl}, pricing=${!!pricingUrl})`
  );
}
