"use client";

import { useState, useEffect, useCallback } from "react";
import { useAnchorProgram } from "@/hooks/useAnchorProgram";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";
import { API_URL } from "@/lib/constants";

const PROGRAM_ID = new PublicKey(
  "9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan"
);

interface Proposal {
  pubkey: string;
  id: number;
  proposer: string;
  title: string;
  description: string;
  votes_for: number;
  votes_against: number;
  created_at: number;
  voting_ends_at: number;
  executed: boolean;
  status: "active" | "passed" | "rejected" | "executed";
  queued?: boolean;
  effective_at?: number;
}

function timeLeft(endsAt: number): string {
  const diff = endsAt * 1000 - Date.now();
  if (diff <= 0) return "Ended";
  const d = Math.floor(diff / 86400_000);
  const h = Math.floor((diff % 86400_000) / 3600_000);
  return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
}

function statusBadge(status: string) {
  const cls =
    status === "active"
      ? "bg-[var(--accent-dim)] text-[var(--accent)]"
      : status === "passed" || status === "executed"
      ? "bg-blue-500/20 text-blue-400"
      : "bg-red-500/20 text-red-400";
  const label =
    status === "active"
      ? "● Active"
      : status === "passed"
      ? "✓ Passed"
      : status === "executed"
      ? "✓ Executed"
      : "✗ Rejected";
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default function GovernancePage() {
  const { program, wallet } = useAnchorProgram();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [votes, setVotes] = useState<Record<number, "for" | "against">>({});
  const [checkingVotes, setCheckingVotes] = useState(false);
  const [voting, setVoting] = useState<number | null>(null);
  const [queuing, setQueuing] = useState<number | null>(null);

  // Stake panel
  const [stakeAmount, setStakeAmount] = useState(100);
  const [staking, setStaking] = useState(false);
  const [staked, setStaked] = useState(false);

  // Create proposal panel
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [creating, setCreating] = useState(false);

  const fetchProposals = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/proposals`);
      if (res.ok) setProposals(await res.json());
    } catch {
      /* noop */
    } finally {
      setLoadingProposals(false);
    }
  }, []);

  // Check on-chain VoteRecord accounts so vote state survives page refresh
  const checkVoteRecords = useCallback(
    async (proposalList: Proposal[]) => {
      if (!wallet || !program || proposalList.length === 0) return;
      setCheckingVotes(true);
      const newVotes: Record<number, "for" | "against"> = {};
      await Promise.allSettled(
        proposalList.map(async (p) => {
          const proposalId = new anchor.BN(p.id);
          const [proposalPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
            PROGRAM_ID
          );
          const [voteRecordPda] = PublicKey.findProgramAddressSync(
            [
              Buffer.from("vote_record"),
              proposalPda.toBuffer(),
              wallet.publicKey.toBuffer(),
            ],
            PROGRAM_ID
          );
          try {
            const record = await (
              program as any
            ).account.voteRecord.fetchNullable(voteRecordPda);
            if (record) newVotes[p.id] = record.vote ? "for" : "against";
          } catch {
            /* no record = not voted */
          }
        })
      );
      setVotes(newVotes);
      setCheckingVotes(false);
    },
    [wallet, program]
  );

  // Enrich passed proposals with on-chain queued/effective_at data
  const enrichPassedProposals = useCallback(
    async (proposalList: Proposal[]) => {
      if (!program) return;
      const passed = proposalList.filter((p) => p.status === "passed");
      if (passed.length === 0) return;
      await Promise.allSettled(
        passed.map(async (p) => {
          const proposalId = new anchor.BN(p.id);
          const [proposalPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
            PROGRAM_ID
          );
          try {
            const acc = await (program as any).account.governanceProposal.fetch(
              proposalPda
            );
            setProposals((prev) =>
              prev.map((q) =>
                q.id === p.id
                  ? {
                      ...q,
                      queued: acc.queued as boolean,
                      effective_at: Number(acc.effectiveAt ?? acc.effective_at),
                    }
                  : q
              )
            );
          } catch {
            /* not found = treat as unqueued */
          }
        })
      );
    },
    [program]
  );

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  // Re-check vote state whenever wallet or proposals change
  useEffect(() => {
    if (proposals.length > 0) checkVoteRecords(proposals);
  }, [proposals, wallet, checkVoteRecords]);

  useEffect(() => {
    if (proposals.length > 0) enrichPassedProposals(proposals);
  }, [proposals, enrichPassedProposals]);

  const handleQueueProposal = async (proposal: Proposal) => {
    if (!program || !wallet) {
      toast.error("Connect wallet first");
      return;
    }
    setQueuing(proposal.id);
    try {
      const proposalId = new anchor.BN(proposal.id);
      const [proposalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
        PROGRAM_ID
      );
      await (program as any).methods
        .queueProposal(proposalId)
        .accounts({
          caller: wallet.publicKey,
          proposal: proposalPda,
        })
        .rpc();
      toast.success(`Proposal #${proposal.id} queued — executable in 48 hours`);
      // Re-enrich to update UI
      setTimeout(() => enrichPassedProposals(proposals), 2000);
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("ProposalNotPassed")) {
        toast.error("Proposal has not passed yet");
      } else if (msg.includes("already in use") || msg.includes("0x0")) {
        toast.info("Proposal is already queued for execution");
        setProposals((prev) =>
          prev.map((q) => (q.id === proposal.id ? { ...q, queued: true } : q))
        );
      } else {
        toast.error("Queue failed", { description: msg });
      }
    } finally {
      setQueuing(null);
    }
  };

  const handleStake = async () => {
    if (!program || !wallet) {
      toast.error("Connect wallet first");
      return;
    }
    setStaking(true);
    try {
      const [stakeAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), wallet.publicKey.toBuffer()],
        program.programId
      );
      await program.methods
        .stakeMyr(new anchor.BN(stakeAmount * 1_000_000))
        .accounts({
          owner: wallet.publicKey,
          stakeAccount: stakeAccountPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      setStaked(true);
      toast.success(
        `Staked ${stakeAmount} MYR — you can now vote on active proposals`
      );
    } catch (e: unknown) {
      const err = e as Error;
      if (
        err.message?.includes("Account does not exist") ||
        err.message?.includes("not found")
      ) {
        toast.info("Stake account not yet initialized on this wallet");
      } else {
        toast.error("Stake failed", { description: err.message });
      }
    } finally {
      setStaking(false);
    }
  };

  const handleVote = async (proposal: Proposal, side: "for" | "against") => {
    if (!wallet || !program) {
      toast.error("Connect wallet first");
      return;
    }
    setVoting(proposal.id);
    try {
      const proposalId = new anchor.BN(proposal.id);
      const [proposalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
        PROGRAM_ID
      );
      const [voteRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("vote_record"),
          proposalPda.toBuffer(),
          wallet.publicKey.toBuffer(),
        ],
        PROGRAM_ID
      );
      const [voterStakePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), wallet.publicKey.toBuffer()],
        PROGRAM_ID
      );
      await (program as any).methods
        .castVote(proposalId, side === "for")
        .accounts({
          voter: wallet.publicKey,
          voterStake: voterStakePda,
          proposal: proposalPda,
          voteRecord: voteRecordPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      setVotes((prev) => ({ ...prev, [proposal.id]: side }));
      toast.success(
        `Voted ${side === "for" ? "✓ For" : "✗ Against"} MIP-${proposal.id}`
      );
    } catch (e: unknown) {
      const msg = (e as Error).message ?? "";
      const alreadyVoted =
        msg.includes("already in use") ||
        msg.includes("already been processed") ||
        msg.includes("0x0") ||
        msg.includes("AccountAlreadyInitialized");
      if (alreadyVoted) {
        toast.error(
          "Already voted — each wallet can only vote once per proposal"
        );
        // Sync on-chain state so UI reflects the correct voted status
        checkVoteRecords(proposals);
      } else {
        toast.error("Vote failed", { description: msg });
      }
    } finally {
      setVoting(null);
    }
  };

  const handleCreate = async () => {
    if (!program || !wallet) {
      toast.error("Connect wallet first");
      return;
    }
    if (!newTitle.trim()) {
      toast.error("Title required");
      return;
    }
    if (!newDescription.trim()) {
      toast.error("Description required");
      return;
    }

    setCreating(true);
    try {
      // Use unix timestamp as unique proposal ID
      const proposalId = new anchor.BN(Math.floor(Date.now() / 1000));
      const [proposalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
        PROGRAM_ID
      );

      const titleBytes = Array.from(Buffer.alloc(64).fill(0));
      Buffer.from(newTitle.slice(0, 63)).copy(Buffer.from(titleBytes));

      const descBytes = Array.from(Buffer.alloc(128).fill(0));
      Buffer.from(newDescription.slice(0, 127)).copy(Buffer.from(descBytes));

      const [proposerStakePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), wallet.publicKey.toBuffer()],
        PROGRAM_ID
      );
      await (program as any).methods
        .createProposal(
          proposalId,
          titleBytes,
          descBytes,
          new anchor.BN(durationDays * 86_400)
        )
        .accounts({
          proposer: wallet.publicKey,
          proposerStake: proposerStakePda,
          proposal: proposalPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      toast.success("Proposal created on-chain");
      setNewTitle("");
      setNewDescription("");
      setShowCreate(false);
      setTimeout(fetchProposals, 2000);
    } catch (e: unknown) {
      toast.error("Create failed", { description: (e as Error).message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Governance
        </h1>
        <p className="text-gray-400 mt-2">
          Stake MYR to vote on protocol parameters, new pool types, and oracle
          configuration. Vote weight is proportional to staked balance. All
          proposals and votes are on-chain.
        </p>
      </div>

      {/* Stake panel */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Stake MYR</h2>
          <span className="text-xs text-gray-500 bg-[var(--surface-2)] px-2 py-1 rounded">
            7-day lock
          </span>
        </div>
        <p className="text-sm text-gray-400">
          Stake MYR to earn protocol fees and gain voting power. You must have
          MYR staked to create proposals or vote — your vote weight equals your
          staked balance.
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
            Staked — earning protocol fee share during lock period
          </div>
        )}
        {!wallet && (
          <p className="text-xs text-gray-600">
            Connect wallet to stake and vote.
          </p>
        )}
      </div>

      {/* Proposals header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          Proposals
          {!loadingProposals && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({proposals.length} on-chain)
            </span>
          )}
          {checkingVotes && (
            <span className="ml-2 text-xs font-normal text-gray-600">
              checking votes…
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="text-sm border border-[var(--border)] hover:border-[var(--accent)]/50 text-gray-300 px-4 py-1.5 rounded-lg transition-colors"
        >
          {showCreate ? "Cancel" : "+ New Proposal"}
        </button>
      </div>

      {/* Create proposal form */}
      {showCreate && (
        <div className="card p-6 space-y-4 border border-[var(--accent)]/30">
          <h3 className="font-semibold text-white text-sm">
            New On-Chain Proposal
          </h3>
          <label className="block space-y-1">
            <span className="text-xs text-gray-500">Title (max 63 chars)</span>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={63}
              placeholder="Add Wildfire Coverage Pool"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm focus:border-[var(--accent)]/50 outline-none"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-gray-500">
              Description (max 127 chars)
            </span>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              maxLength={127}
              rows={3}
              placeholder="Describe what this proposal changes and why…"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm focus:border-[var(--accent)]/50 outline-none resize-none"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-gray-500">
              Voting duration (days, 1–30)
            </span>
            <input
              type="number"
              value={durationDays}
              onChange={(e) =>
                setDurationDays(
                  Math.min(30, Math.max(1, Number(e.target.value)))
                )
              }
              min={1}
              max={30}
              className="w-32 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm focus:border-[var(--accent)]/50 outline-none"
            />
          </label>
          <button
            onClick={handleCreate}
            disabled={creating || !wallet}
            className="bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 text-black font-bold px-6 py-2 rounded-lg text-sm transition-opacity"
          >
            {creating ? "Creating…" : "Create Proposal On-Chain"}
          </button>
          {!wallet && (
            <p className="text-xs text-gray-600">
              Connect wallet to create a proposal.
            </p>
          )}
        </div>
      )}

      {/* Proposal list */}
      <div className="space-y-4">
        {loadingProposals ? (
          <div className="card p-6 text-center text-gray-500 text-sm">
            Loading proposals from chain…
          </div>
        ) : proposals.length === 0 ? (
          <div className="card p-6 text-center text-gray-500 text-sm">
            No proposals found on-chain yet.
          </div>
        ) : (
          proposals.map((p) => {
            const total = p.votes_for + p.votes_against;
            const forPct = total > 0 ? (p.votes_for / total) * 100 : 50;
            const myVote = votes[p.id];

            return (
              <div key={p.pubkey} className="card p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-mono">
                        MIP-{p.id}
                      </span>
                      {statusBadge(p.status)}
                    </div>
                    <h3 className="text-white font-semibold">{p.title}</h3>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">
                    {timeLeft(p.voting_ends_at)}
                  </span>
                </div>

                <p className="text-sm text-gray-400 leading-relaxed">
                  {p.description}
                </p>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>For: {p.votes_for + (myVote === "for" ? 1 : 0)}</span>
                    <span>
                      Against:{" "}
                      {p.votes_against + (myVote === "against" ? 1 : 0)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-[var(--accent)] transition-all"
                      style={{ width: `${forPct}%` }}
                    />
                    <div className="h-full bg-red-500/60 flex-1" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>
                      {forPct.toFixed(1)}% in favor · Quorum: 100 votes
                    </span>
                    <a
                      href={`https://explorer.solana.com/address/${p.pubkey}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-gray-600 hover:text-gray-400 font-mono"
                    >
                      {p.pubkey.slice(0, 8)}… ↗
                    </a>
                  </div>
                </div>

                {p.status === "active" && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleVote(p, "for")}
                      disabled={
                        voting === p.id || myVote !== undefined || checkingVotes
                      }
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        myVote === "for"
                          ? "bg-[var(--accent-dim)] border border-[var(--accent)] text-[var(--accent)]"
                          : "border border-[var(--border)] text-gray-300 hover:border-[var(--accent)]/50 disabled:opacity-40"
                      }`}
                    >
                      {myVote === "for"
                        ? "✓ Voted For"
                        : voting === p.id
                        ? "Voting…"
                        : "Vote For"}
                    </button>
                    <button
                      onClick={() => handleVote(p, "against")}
                      disabled={
                        voting === p.id || myVote !== undefined || checkingVotes
                      }
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        myVote === "against"
                          ? "bg-red-500/10 border border-red-500/60 text-red-400"
                          : "border border-[var(--border)] text-gray-300 hover:border-red-500/40 disabled:opacity-40"
                      }`}
                    >
                      {myVote === "against"
                        ? "✗ Voted Against"
                        : "Vote Against"}
                    </button>
                  </div>
                )}

                {p.status === "passed" && !p.executed && (
                  <div className="pt-1">
                    {p.queued ? (
                      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 space-y-1">
                        <div className="text-xs font-semibold text-blue-400">
                          ⏱ Queued — 48-hour timelock in progress
                        </div>
                        {p.effective_at && (
                          <div className="text-xs text-gray-500">
                            Executable after{" "}
                            {new Date(p.effective_at * 1000).toLocaleString()} ·{" "}
                            {timeLeft(p.effective_at)}
                          </div>
                        )}
                        <div className="text-xs text-gray-600">
                          Visit the{" "}
                          <a href="/admin" className="text-[var(--accent)] underline">
                            Governance Dashboard
                          </a>{" "}
                          to execute after the delay expires.
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleQueueProposal(p)}
                        disabled={queuing === p.id || !wallet}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        {queuing === p.id
                          ? "Queuing…"
                          : "Queue for Execution (starts 48h timelock)"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Explainer */}
      <div className="card p-6 space-y-2 text-sm text-gray-400">
        <p>
          <span className="text-white font-medium">
            On-chain instructions:{" "}
          </span>
          <code className="text-[var(--accent)]">create_proposal</code>{" "}
          initializes a PDA keyed by proposal ID with a configurable voting
          window.
          <code className="text-[var(--accent)] ml-1">cast_vote</code> records
          your vote — any connected wallet can vote, one vote per tx.
          <code className="text-[var(--accent)] ml-1">stake_myr</code> locks
          tokens for protocol fee sharing (separate from voting).
        </p>
        <p>
          All proposal state lives on-chain. Proposals and votes are permanent
          and publicly verifiable.
        </p>
      </div>
    </div>
  );
}
