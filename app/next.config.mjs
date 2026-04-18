/** @type {import('next').NextConfig} */
const nextConfig = {
  // Wallet adapter packages are browser-only ESM; skip SSR for them
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(config.externals || []),
        "@solana/wallet-adapter-react",
        "@solana/wallet-adapter-react-ui",
        "@solana/wallet-adapter-wallets",
        "@solana/wallet-adapter-base",
      ];
    }
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      os: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;
