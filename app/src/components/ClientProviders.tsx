"use client";

import { SolanaWalletProvider } from "@/components/wallet/WalletProvider";
import { Toaster } from "sonner";
import Link from "next/link";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  async () => {
    const { WalletMultiButton } = await import("@solana/wallet-adapter-react-ui");
    return WalletMultiButton;
  },
  { ssr: false }
);

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <SolanaWalletProvider>
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-emerald-400">
          🐜 MYRMEX
        </Link>
        <div className="flex gap-6 text-sm text-gray-400">
          <Link href="/buy" className="hover:text-white transition-colors">Buy Policy</Link>
          <Link href="/pool" className="hover:text-white transition-colors">LP Pool</Link>
          <Link href="/portfolio" className="hover:text-white transition-colors">Portfolio</Link>
          <Link href="/simulate" className="hover:text-white transition-colors">Demo</Link>
        </div>
        <div suppressHydrationWarning>
          <WalletMultiButton />
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-10">
        {children}
      </main>
      <Toaster theme="dark" />
    </SolanaWalletProvider>
  );
}
