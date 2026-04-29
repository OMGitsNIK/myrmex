"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[myrmex] unhandled error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="text-4xl">⚠</div>
        <h1 className="text-xl font-bold text-white">Something went wrong</h1>
        <p className="text-gray-400 text-sm">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="bg-[var(--accent)] text-black font-bold px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
