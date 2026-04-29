use crate::errors::MyrmexError;
use crate::state::GovernanceProposal;
use anchor_lang::prelude::*;

const TIMELOCK_SECS: i64 = 172_800; // 48 hours

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct QueueProposal<'info> {
    /// Permissionless — anyone can queue a passed proposal.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"proposal", &proposal_id.to_le_bytes()],
        bump = proposal.bump,
        constraint = !proposal.executed @ MyrmexError::Unauthorized,
        constraint = !proposal.queued  @ MyrmexError::Unauthorized,
    )]
    pub proposal: Account<'info, GovernanceProposal>,
}

pub fn handler(ctx: Context<QueueProposal>, _proposal_id: u64) -> Result<()> {
    let clock = Clock::get()?;
    let proposal = &mut ctx.accounts.proposal;

    require!(
        clock.unix_timestamp >= proposal.voting_ends_at,
        MyrmexError::ProposalNotPassed
    );
    require!(
        proposal.votes_for > proposal.votes_against,
        MyrmexError::ProposalNotPassed
    );

    proposal.queued = true;
    proposal.effective_at = clock
        .unix_timestamp
        .checked_add(TIMELOCK_SECS)
        .ok_or(error!(MyrmexError::MathOverflow))?;

    msg!(
        "Proposal #{} queued for execution; effective at {}",
        proposal.id,
        proposal.effective_at
    );
    Ok(())
}
