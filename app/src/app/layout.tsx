import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import dynamic from "next/dynamic";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MYRMEX — Decentralized Parametric Insurance",
  description: "The ant colony of insurance. Instant payouts, zero adjusters.",
};

// Load all wallet-related UI client-side only — no SSR
const ClientProviders = dynamic(
  () => import("@/components/ClientProviders"),
  { ssr: false }
);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-950 text-white min-h-screen`}>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
