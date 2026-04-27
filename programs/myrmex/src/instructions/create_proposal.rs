use crate::errors::MyrmexError;
use crate::state::{GovernanceProposal, StakeAccount};
use anchor_lang::prelude::*;

/// Minimum voting duration: 1 day. Maximum: 30 days.
const MIN_VOTING_SECS: i64 = 86_400;
const MAX_VOTING_SECS: i64 = 86_400 * 30;

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,

    /// Proposer must have MYR staked — prevents spam from wallets with no skin in the game.
    #[account(
        seeds = [b"stake", proposer.key().as_ref()],
        bump = proposer_stake.bump,
        constraint = proposer_stake.owner == proposer.key() @ MyrmexError::Unauthorized,
        constraint = proposer_stake.amount_staked > 0 @ MyrmexError::Unauthorized,
    )]
    pub proposer_stake: Account<'info, StakeAccount>,

    #[account(
        init,
        payer = proposer,
        space = GovernanceProposal::LEN,
        seeds = [b"proposal", &proposal_id.to_le_bytes()],
        bump
    )]
    pub proposal: Account<'info, GovernanceProposal>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateProposal>,
    proposal_id: u64,
    title: [u8; 64],
    description: [u8; 128],
    voting_duration_secs: i64,
) -> Result<()> {
    require!(
        (MIN_VOTING_SECS..=MAX_VOTING_SECS).contains(&voting_duration_secs),
        MyrmexError::InvalidConfig
    );

    let clock = Clock::get()?;
    let proposal = &mut ctx.accounts.proposal;

    proposal.id = proposal_id;
    proposal.proposer = ctx.accounts.proposer.key();
    proposal.title = title;
    proposal.description = description;
    proposal.votes_for = 0;
    proposal.votes_against = 0;
    proposal.created_at = clock.unix_timestamp;
    proposal.voting_ends_at = clock
        .unix_timestamp
        .checked_add(voting_duration_secs)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    proposal.executed = false;
    proposal.bump = ctx.bumps.proposal;

    msg!(
        "Proposal #{} created: voting ends at {}",
        proposal_id,
        proposal.voting_ends_at
    );
    Ok(())
}
