import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <div className="text-center space-y-6 py-16 sm:py-24">
        <div className="inline-block px-3 py-1 rounded-full border border-[var(--accent)]/30 text-[var(--accent)] text-xs tracking-widest uppercase mb-2">
          Solana · Devnet · Anchor 0.32
        </div>
        <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-white glow-text">
          MYRMEX
        </h1>
        <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Decentralized parametric insurance on Solana. Real-world oracle data triggers
          automatic USDC payouts in under 1 second — no adjusters, no delays, no trust required.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
          <Link
            href="/buy"
            className="bg-[var(--accent)] hover:opacity-90 text-black font-bold px-8 py-3 rounded-lg transition-opacity text-sm tracking-wide shadow-[0_0_20px_rgba(0,255,135,0.3)]"
          >
            Buy Coverage
          </Link>
          <Link
            href="/pool"
            className="border border-[var(--border)] hover:border-[var(--accent)]/50 text-white px-8 py-3 rounded-lg transition-colors text-sm tracking-wide"
          >
            Provide Liquidity
          </Link>
          <Link
            href="/simulate"
            className="border border-[var(--accent)]/40 hover:border-[var(--accent)] text-[var(--accent)] px-8 py-3 rounded-lg transition-colors text-sm tracking-wide"
          >
            Watch Demo →
          </Link>
        </div>
      </div>

      {/* Live stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--border)] rounded-xl overflow-hidden">
        {[
          { label: "Settlement Time", value: "< 1 second" },
          { label: "Claims Adjusters", value: "Zero" },
          { label: "Annual Market Gap", value: "$200B+" },
          { label: "Chain", value: "Solana" },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--surface)] px-6 py-5 text-center">
            <div className="text-[var(--accent)] font-bold text-lg">{s.value}</div>
            <div className="text-gray-500 text-xs mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage types — 3×2 grid */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-2 tracking-wide">6 Live Insurance Markets</h2>
        <p className="text-gray-500 text-sm mb-6">
          Every category is backed by real oracle data — USGS, NOAA, CoinGecko, DeFiLlama, Open-Meteo.
          Premiums are priced by an actuarial model tuned to historical event frequencies.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {COVERAGE_CARDS.map((c) => (
            <div
              key={c.title}
              className="card card-hover p-6 space-y-3 group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 opacity-5 rounded-full blur-2xl pointer-events-none" style={{ background: c.color }} />
              <div className="text-2xl">{c.icon}</div>
              <h3 className="font-semibold text-white">{c.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{c.description}</p>
              <div className="flex items-center justify-between pt-1">
                <div className="text-xs text-[var(--accent)] font-mono bg-[var(--accent-dim)] px-2 py-1 rounded">
                  {c.trigger}
                </div>
                <div className="text-xs text-gray-600 font-medium">{c.gap} gap</div>
              </div>
              <div className="text-[10px] text-gray-600 pt-0.5">Oracle: {c.oracle}</div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="card p-8">
        <h2 className="text-xl font-semibold text-white mb-8 tracking-wide">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-8">
          {STEPS.map((s, i) => (
            <div key={i} className="space-y-3">
              <div className="w-8 h-8 rounded-full bg-[var(--accent-dim)] border border-[var(--accent)]/30 text-[var(--accent)] flex items-center justify-center text-sm font-bold">
                {i + 1}
              </div>
              <h4 className="font-medium text-white text-sm">{s.title}</h4>
              <p className="text-sm text-gray-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tech stack callout */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {TECH_PILLARS.map((t) => (
          <div key={t.title} className="card p-5 space-y-2">
            <div className="text-lg">{t.icon}</div>
            <div className="font-semibold text-white text-sm">{t.title}</div>
            <div className="text-xs text-gray-400 leading-relaxed">{t.desc}</div>
          </div>
        ))}
      </div>

      {/* CTA footer */}
      <div className="text-center py-8 border-t border-[var(--border)]">
        <p className="text-gray-500 text-sm">
          Built for Colosseum Hackathon · Program{" "}
          <span className="font-mono text-gray-400">9naJhrt9…pan</span> · Devnet
        </p>
      </div>
    </div>
  );
}

const COVERAGE_CARDS = [
  {
    icon: "🌍",
    title: "Earthquake",
    description: "Pays when USGS confirms a major earthquake above your magnitude threshold. 130M+ people in seismic zones are uninsured.",
    trigger: "mag > threshold",
    gap: "$40B",
    oracle: "USGS Earthquake API",
    color: "#f59e0b",
  },
  {
    icon: "🌊",
    title: "Flood",
    description: "Triggered by USGS river gauge readings. Only 5% of global flood losses are covered by traditional insurance.",
    trigger: "gauge_ft > threshold",
    gap: "$58B",
    oracle: "USGS Water Services",
    color: "#3b82f6",
  },
  {
    icon: "🌾",
    title: "Crop Multi-Factor",
    description: "Composite AI score tracks rainfall, heat stress, and dry days. 500M smallholder farmers have zero safety net.",
    trigger: "score < threshold",
    gap: "$100B+",
    oracle: "Open-Meteo dual-source",
    color: "#22c55e",
  },
  {
    icon: "🌀",
    title: "Hurricane / Cyclone",
    description: "NOAA NHC real-time storm data. Coastal communities face $30B+ in annual uninsured losses every hurricane season.",
    trigger: "wind_kt > threshold",
    gap: "$30B",
    oracle: "NOAA NHC + Weather.gov",
    color: "#8b5cf6",
  },
  {
    icon: "💵",
    title: "Stablecoin Depeg",
    description: "Pays if USDC or USDT trades below your peg threshold. UST wiped out $40B overnight — holders had no safety net.",
    trigger: "price < threshold",
    gap: "Growing",
    oracle: "CoinGecko dual-endpoint",
    color: "#06b6d4",
  },
  {
    icon: "🛡",
    title: "Bridge / Exchange Hack",
    description: "TVL velocity detection across Wormhole, Stargate, Across. Over $3B lost to bridge exploits in 2023 alone.",
    trigger: "TVL < threshold",
    gap: "$3B+/yr",
    oracle: "DeFiLlama bridges",
    color: "#ef4444",
  },
];

const STEPS = [
  {
    title: "Pool funded",
    desc: "LPs deposit USDC into a risk pool and receive LP tokens representing their yield-bearing share.",
  },
  {
    title: "Policy created",
    desc: "You pay a premium on-chain. Your payout is atomically locked by the pool and cannot be clawed back.",
  },
  {
    title: "Oracle monitors",
    desc: "Every 5 minutes, real-world data is fetched, AI-validated by Groq LLaMA, and posted on-chain by a signed oracle keypair.",
  },
  {
    title: "Auto payout",
    desc: "Trigger fires → USDC sent to your wallet in the same transaction. No claim filing. No adjuster. No delay.",
  },
];

const TECH_PILLARS = [
  {
    icon: "⚓",
    title: "Anchor Smart Contract",
    desc: "8 instructions, CEI pattern, checked arithmetic on all u64/u128 operations. Zero clippy warnings. Deployed on Solana devnet.",
  },
  {
    icon: "🤖",
    title: "AI-Validated Oracles",
    desc: "Groq LLaMA-3.3-70b validates each data reading against dual sources before posting on-chain. 5-minute cron, 6 real data pipelines.",
  },
  {
    icon: "📐",
    title: "Actuarial Pricing",
    desc: "Expected-value model: period_prob × payout × volatility_loading × utilization_loading. Calibrated to real event frequencies.",
  },
];
