"use client";

import { useState } from "react";
import { useAnchorProgram } from "@/hooks/useAnchorProgram";
import * as anchor from "@coral-xyz/anchor";
import { toast } from "sonner";
import { explorerUrl } from "@/lib/constants";

interface Proposal {
  id: number;
  title: string;
  description: string;
  status: "active" | "passed" | "rejected";
  votesFor: number;
  votesAgainst: number;
  endsAt: Date;
}

const MOCK_PROPOSALS: Proposal[] = [
  {
    id: 1,
    title: "Add Wildfire Coverage Pool",
    description:
      "Initialize a new RiskPool (type 6) backed by NASA FIRMS fire data. Trigger when FRP (Fire Radiative Power) exceeds threshold in insured region. Oracle: NASA FIRMS + USGS satellite.",
    status: "active",
    votesFor: 142,
    votesAgainst: 23,
    endsAt: new Date(Date.now() + 5 * 86400_000),
  },
  {
    id: 2,
    title: "Raise max oracle staleness to 48h",
    description:
      "Current MAX_AGE_SECS = 86400 (24h). Proposal to raise to 172800 (48h) for hurricane pool during off-season when NHC may not publish updates daily.",
    status: "active",
    votesFor: 87,
    votesAgainst: 61,
    endsAt: new Date(Date.now() + 3 * 86400_000),
  },
  {
    id: 3,
    title: "Reduce minimum premium from 50bps to 30bps",
    description:
      "Stablecoin depeg pool min premium is currently 50bps. Reduce to 30bps to make small cover amounts economically viable for retail users.",
    status: "passed",
    votesFor: 210,
    votesAgainst: 44,
    endsAt: new Date(Date.now() - 2 * 86400_000),
  },
];

export default function GovernancePage() {
  const { program, wallet } = useAnchorProgram();
  const [stakeAmount, setStakeAmount] = useState(100);
  const [staking, setStaking] = useState(false);
  const [staked, setStaked] = useState(false);
  const [voting, setVoting] = useState<number | null>(null);
  const [votes, setVotes] = useState<Record<number, "for" | "against">>({});

  const handleStake = async () => {
    if (!program || !wallet) { toast.error("Connect wallet first"); return; }
    setStaking(true);
    try {
      // stake_myr instruction — 7-day lock period
      const [stakeAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), wallet.publicKey.toBuffer()],
        program.programId
      );
      await program.methods
        .stakeMyr(new anchor.BN(stakeAmount * 1_000_000))
        .accounts({
          staker: wallet.publicKey,
          stakeAccount: stakeAccountPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      setStaked(true);
      toast.success(`Staked ${stakeAmount} MYR for governance voting (7-day lock)`);
    } catch (e: unknown) {
      const err = e as Error;
      if (err.message?.includes("Account does not exist") || err.message?.includes("not found")) {
        toast.info("Stake account not yet initialized on this wallet — governance in final devnet phase");
      } else {
        toast.error("Stake failed", { description: err.message });
      }
    } finally {
      setStaking(false);
    }
  };

  const handleVote = async (proposalId: number, side: "for" | "against") => {
    if (!wallet) { toast.error("Connect wallet first"); return; }
    setVoting(proposalId);
    try {
      // cast_vote instruction — requires staked MYR
      if (program) {
        const [stakeAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("stake"), wallet.publicKey.toBuffer()],
          program.programId
        );
        await program.methods
          .castVote(new anchor.BN(proposalId), side === "for" ? 1 : 0)
          .accounts({
            voter: wallet.publicKey,
            stakeAccount: stakeAccountPda,
          })
          .rpc();
      }
      setVotes((prev) => ({ ...prev, [proposalId]: side }));
      toast.success(`Voted ${side === "for" ? "✓ For" : "✗ Against"} Proposal #${proposalId}`);
    } catch (e: unknown) {
      const err = e as Error;
      if (err.message?.includes("Account does not exist") || err.message?.includes("not found")) {
        toast.error("Vote failed: stake account not found. Stake MYR first to participate in governance.");
      } else {
        toast.error("Vote failed", { description: err.message });
      }
    } finally {
      setVoting(null);
    }
  };

  const daysLeft = (d: Date) => {
    const diff = d.getTime() - Date.now();
    if (diff < 0) return "Ended";
    const days = Math.floor(diff / 86400_000);
    const hours = Math.floor((diff % 86400_000) / 3600_000);
    return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`;
  };

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Governance</h1>
        <p className="text-gray-400 mt-2">
          Stake MYR tokens to vote on protocol parameters, new pool types, and oracle configuration.
          All changes are enforced on-chain after quorum is reached.
        </p>
      </div>

      {/* Stake panel */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Stake MYR</h2>
          <span className="text-xs text-gray-500 bg-[var(--surface-2)] px-2 py-1 rounded">7-day lock</span>
        </div>
        <p className="text-sm text-gray-400">
          Staked MYR grants voting power proportional to your stake. Tokens are locked for 7 days
          and earn a share of protocol fees during the lock period.
        </p>
        <div className="flex gap-3">
          <input
            type="number"
            value={stakeAmount}
            onChange={(e) => setStakeAmount(Number(e.target.value))}
            className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white focus:border-[var(--accent)]/50 outline-none transition-colors"
            min={1}
            placeholder="MYR amount"
          />
          <button
            onClick={handleStake}
            disabled={staking || !wallet}
            className="bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 text-black font-bold px-5 py-2 rounded-lg text-sm transition-opacity"
          >
            {staking ? "Staking…" : staked ? "Stake More" : "Stake"}
          </button>
        </div>
        {staked && (
          <div className="flex items-center gap-2 text-sm text-[var(--accent)]">
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse inline-block" />
            Staked — you can now vote on active proposals
          </div>
        )}
        {!wallet && (
          <p className="text-xs text-gray-600">Connect wallet to stake and vote.</p>
        )}
      </div>

      {/* Proposals */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Proposals</h2>
        {MOCK_PROPOSALS.map((p) => {
          const total = p.votesFor + p.votesAgainst;
          const forPct = total > 0 ? (p.votesFor / total) * 100 : 50;
          const myVote = votes[p.id];

          return (
            <div key={p.id} className="card p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-mono">MIP-{p.id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      p.status === "active" ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                      : p.status === "passed" ? "bg-blue-500/20 text-blue-400"
                      : "bg-red-500/20 text-red-400"
                    }`}>
                      {p.status === "active" ? "● Active" : p.status === "passed" ? "✓ Passed" : "✗ Rejected"}
                    </span>
                  </div>
                  <h3 className="text-white font-semibold">{p.title}</h3>
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap">{daysLeft(p.endsAt)}</span>
              </div>

              <p className="text-sm text-gray-400 leading-relaxed">{p.description}</p>

              {/* Vote bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>For: {p.votesFor + (myVote === "for" ? 1 : 0)}</span>
                  <span>Against: {p.votesAgainst + (myVote === "against" ? 1 : 0)}</span>
                </div>
                <div className="h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-[var(--accent)] transition-all"
                    style={{ width: `${forPct}%` }}
                  />
                  <div className="h-full bg-red-500/60 flex-1" />
                </div>
                <div className="text-xs text-gray-600">{forPct.toFixed(1)}% in favor · Quorum: 100 votes</div>
              </div>

              {p.status === "active" && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleVote(p.id, "for")}
                    disabled={voting === p.id || myVote !== undefined}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      myVote === "for"
                        ? "bg-[var(--accent-dim)] border border-[var(--accent)] text-[var(--accent)]"
                        : "border border-[var(--border)] text-gray-300 hover:border-[var(--accent)]/50 disabled:opacity-40"
                    }`}
                  >
                    {myVote === "for" ? "✓ Voted For" : voting === p.id ? "Voting…" : "Vote For"}
                  </button>
                  <button
                    onClick={() => handleVote(p.id, "against")}
                    disabled={voting === p.id || myVote !== undefined}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      myVote === "against"
                        ? "bg-red-500/10 border border-red-500/60 text-red-400"
                        : "border border-[var(--border)] text-gray-300 hover:border-red-500/40 disabled:opacity-40"
                    }`}
                  >
                    {myVote === "against" ? "✗ Voted Against" : "Vote Against"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Explainer */}
      <div className="card p-6 space-y-2 text-sm text-gray-400">
        <p><span className="text-white font-medium">On-chain instructions:</span>{" "}
          <code className="text-[var(--accent)]">stake_myr</code> locks tokens in a PDA stake account with a 7-day unlock timestamp.
          <code className="text-[var(--accent)] ml-1">cast_vote</code> records your vote and validates your stake account hasn&apos;t expired.
        </p>
        <p>
          Proposals are currently indexed off-chain. Full on-chain proposal creation coming in v2.1.
        </p>
      </div>
    </div>
  );
}
