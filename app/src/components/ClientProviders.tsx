"use client";

import { SolanaWalletProvider } from "@/components/wallet/WalletProvider";
import { Toaster } from "sonner";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useState } from "react";

const WalletMultiButton = dynamic(
  async () => {
    const { WalletMultiButton } = await import("@solana/wallet-adapter-react-ui");
    return WalletMultiButton;
  },
  { ssr: false }
);

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const navLinks = [
    { href: "/buy", label: "Buy Policy" },
    { href: "/claim", label: "Claim" },
    { href: "/pool", label: "LP Pool" },
    { href: "/portfolio", label: "Portfolio" },
    { href: "/admin", label: "Admin" },
    { href: "/simulate", label: "Demo" },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <SolanaWalletProvider>
      <nav className="border-b border-[var(--border)] px-6 py-4 relative z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="text-xl font-bold tracking-widest text-[var(--accent)] glow-text">
            MYRMEX
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex gap-8 text-sm">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`transition-colors relative pb-0.5 ${
                  isActive(item.href)
                    ? "text-[var(--accent)] font-medium after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-[var(--accent)] after:rounded-full"
                    : "text-gray-400 hover:text-[var(--accent)]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Wallet + hamburger */}
          <div className="flex items-center gap-3">
            <div suppressHydrationWarning className="hidden sm:block">
              <WalletMultiButton />
            </div>
            {/* Hamburger — mobile only */}
            <button
              className="md:hidden flex flex-col gap-1.5 p-1"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              <span className={`block w-5 h-0.5 bg-[var(--accent)] transition-transform duration-200 ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
              <span className={`block w-5 h-0.5 bg-[var(--accent)] transition-opacity duration-200 ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block w-5 h-0.5 bg-[var(--accent)] transition-transform duration-200 ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-[var(--border)] pt-4 flex flex-col gap-4 text-sm">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`transition-colors ${
                  isActive(item.href)
                    ? "text-[var(--accent)] font-medium"
                    : "text-gray-400 hover:text-[var(--accent)]"
                }`}
                onClick={() => setMenuOpen(false)}
              >
                {isActive(item.href) ? `› ${item.label}` : item.label}
              </Link>
            ))}
            <div suppressHydrationWarning className="sm:hidden">
              <WalletMultiButton />
            </div>
          </div>
        )}
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {children}
      </main>
      <Toaster theme="dark" />
    </SolanaWalletProvider>
  );
}
