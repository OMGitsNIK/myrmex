import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <div className="text-center space-y-4 py-16">
        <div className="text-6xl">🐜</div>
        <h1 className="text-5xl font-bold text-white">MYRMEX</h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          Decentralized parametric insurance on Solana. Oracles trigger automatic
          payouts in under 1 second — no adjusters, no delays, no trust required.
        </p>
        <div className="flex gap-4 justify-center mt-8">
          <Link
            href="/buy"
            className="bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Buy Coverage
          </Link>
          <Link
            href="/pool"
            className="border border-gray-600 hover:border-gray-400 text-white px-6 py-3 rounded-lg transition-colors"
          >
            Provide Liquidity
          </Link>
          <Link
            href="/simulate"
            className="border border-emerald-600 hover:border-emerald-400 text-emerald-400 px-6 py-3 rounded-lg transition-colors"
          >
            Watch Demo
          </Link>
        </div>
      </div>

      {/* Coverage types */}
      <div className="grid grid-cols-3 gap-6">
        {COVERAGE_CARDS.map((c) => (
          <div
            key={c.title}
            className="border border-gray-800 rounded-xl p-6 space-y-3 hover:border-gray-600 transition-colors"
          >
            <div className="text-3xl">{c.icon}</div>
            <h3 className="font-semibold text-white">{c.title}</h3>
            <p className="text-sm text-gray-400">{c.description}</p>
            <div className="text-xs text-emerald-400">Trigger: {c.trigger}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="border border-gray-800 rounded-xl p-8">
        <h2 className="text-2xl font-bold mb-6">How it works</h2>
        <div className="grid grid-cols-4 gap-6">
          {STEPS.map((s, i) => (
            <div key={i} className="space-y-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-bold">
                {i + 1}
              </div>
              <h4 className="font-medium text-white">{s.title}</h4>
              <p className="text-sm text-gray-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const COVERAGE_CARDS = [
  {
    icon: "✈",
    title: "Flight Delay",
    description: "Automatic payout when your flight is delayed beyond your threshold.",
    trigger: "delay > N minutes",
  },
  {
    icon: "🌾",
    title: "Crop Drought",
    description: "Protect your harvest when rainfall drops below the growing threshold.",
    trigger: "rainfall < N mm",
  },
  {
    icon: "🛡",
    title: "DeFi Hack",
    description: "Cover your on-chain positions against protocol exploits.",
    trigger: "oracle reports exploit",
  },
];

const STEPS = [
  { title: "Pool funded", desc: "LPs deposit USDC, receive LP tokens representing their share." },
  { title: "Policy created", desc: "You pay a premium, your payout is locked by the pool." },
  { title: "Oracle monitors", desc: "Pyth/Switchboard oracle tracks the real-world event 24/7." },
  { title: "Auto payout", desc: "Trigger fires → USDC arrives in your wallet in <1 second." },
];
