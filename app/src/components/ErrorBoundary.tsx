"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[myrmex] ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
          <div className="max-w-md w-full space-y-6 text-center">
            <div className="text-4xl">⚠</div>
            <h1 className="text-xl font-bold text-white">
              Wallet or RPC error
            </h1>
            <p className="text-gray-400 text-sm">
              {this.state.error.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="bg-[var(--accent)] text-black font-bold px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity text-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
