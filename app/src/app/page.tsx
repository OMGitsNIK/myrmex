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
          Decentralized parametric insurance on Solana. Oracles trigger automatic
          payouts in under 1 second — no adjusters, no delays, no trust required.
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
            Watch Demo
          </Link>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--border)] rounded-xl overflow-hidden">
        {[
          { label: "Claims Mechanism", value: "Parametric" },
          { label: "Settlement Time", value: "< 1 second" },
          { label: "Adjusters Required", value: "Zero" },
          { label: "Chain", value: "Solana" },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--surface)] px-6 py-5 text-center">
            <div className="text-[var(--accent)] font-bold text-lg">{s.value}</div>
            <div className="text-gray-500 text-xs mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage types */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-6 tracking-wide">Coverage Types</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {COVERAGE_CARDS.map((c) => (
            <div
              key={c.title}
              className="card card-hover p-6 space-y-3 group"
            >
              <div className="text-2xl">{c.icon}</div>
              <h3 className="font-semibold text-white">{c.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{c.description}</p>
              <div className="text-xs text-[var(--accent)] font-mono bg-[var(--accent-dim)] px-2 py-1 rounded inline-block">
                {c.trigger}
              </div>
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

      {/* CTA footer */}
      <div className="text-center py-8 border-t border-[var(--border)]">
        <p className="text-gray-500 text-sm">
          Built for Colosseum Hackathon · Program{" "}
          <span className="font-mono text-gray-400">9naJhrt...pan</span>
        </p>
      </div>
    </div>
  );
}

const COVERAGE_CARDS = [
  {
    icon: "✈",
    title: "Flight Delay",
    description: "Automatic payout when your flight is delayed beyond your threshold. No claim filing needed.",
    trigger: "delay > N minutes",
  },
  {
    icon: "🌾",
    title: "Crop Drought",
    description: "Protect your harvest when rainfall drops below the growing threshold in your region.",
    trigger: "rainfall < N mm",
  },
  {
    icon: "🛡",
    title: "DeFi Hack",
    description: "Cover your on-chain positions against protocol exploits — oracle-confirmed, instant payout.",
    trigger: "oracle reports exploit",
  },
];

const STEPS = [
  { title: "Pool funded", desc: "LPs deposit USDC, receive LP tokens representing their share of the risk pool." },
  { title: "Policy created", desc: "You pay a premium; your payout is locked by the pool at creation time." },
  { title: "Oracle monitors", desc: "Switchboard oracle tracks the real-world event 24/7, on-chain." },
  { title: "Auto payout", desc: "Trigger fires → USDC sent to your wallet in under 1 second." },
];
