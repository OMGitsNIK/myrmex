use anchor_lang::prelude::*;

use crate::errors::MyrmexError;
use crate::state::{GovernanceProposal, StakeAccount, VoteRecord};

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,

    /// Voter must have MYR staked; their stake weight is used as the vote weight.
    #[account(
        seeds = [b"stake", voter.key().as_ref()],
        bump = voter_stake.bump,
        constraint = voter_stake.owner == voter.key() @ MyrmexError::Unauthorized,
        constraint = voter_stake.amount_staked > 0 @ MyrmexError::Unauthorized,
    )]
    pub voter_stake: Account<'info, StakeAccount>,

    #[account(
        mut,
        constraint = !proposal.executed @ MyrmexError::PolicyNotActive,
        seeds = [b"proposal", &proposal_id.to_le_bytes()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, GovernanceProposal>,

    /// One-time-use PDA proving this (voter, proposal) pair hasn't voted yet.
    /// `init` fails if it already exists — this is the double-vote guard.
    #[account(
        init,
        payer = voter,
        space = VoteRecord::LEN,
        seeds = [b"vote_record", proposal.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CastVote>, _proposal_id: u64, vote: bool) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < ctx.accounts.proposal.voting_ends_at,
        MyrmexError::PolicyExpired
    );

    let weight = ctx.accounts.voter_stake.amount_staked;
    let proposal = &mut ctx.accounts.proposal;
    if vote {
        proposal.votes_for = proposal
            .votes_for
            .checked_add(weight)
            .ok_or(error!(MyrmexError::MathOverflow))?;
    } else {
        proposal.votes_against = proposal
            .votes_against
            .checked_add(weight)
            .ok_or(error!(MyrmexError::MathOverflow))?;
    }

    let record = &mut ctx.accounts.vote_record;
    record.proposal = proposal.key();
    record.voter = ctx.accounts.voter.key();
    record.vote = vote;
    record.bump = ctx.bumps.vote_record;

    Ok(())
}
