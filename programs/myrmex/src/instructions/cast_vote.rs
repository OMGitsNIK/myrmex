use anchor_lang::prelude::*;

use crate::errors::MyrmexError;
use crate::state::{GovernanceProposal, StakeAccount};

#[derive(Accounts)]
#[instruction(proposal_id: u64, vote: bool)]
pub struct CastVote<'info> {
    pub voter: Signer<'info>,

    #[account(
        constraint = stake_account.owner == voter.key() @ MyrmexError::Unauthorized,
        constraint = stake_account.amount_staked > 0 @ MyrmexError::InsufficientLiquidity,
    )]
    pub stake_account: Account<'info, StakeAccount>,

    #[account(
        mut,
        constraint = !proposal.executed @ MyrmexError::PolicyNotActive,
        seeds = [b"proposal", &proposal_id.to_le_bytes()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, GovernanceProposal>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CastVote>, _proposal_id: u64, vote: bool) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < ctx.accounts.proposal.voting_ends_at,
        MyrmexError::PolicyExpired
    );

    let votes = ctx.accounts.stake_account.amount_staked;
    let proposal = &mut ctx.accounts.proposal;

    if vote {
        proposal.votes_for = proposal
            .votes_for
            .checked_add(votes)
            .ok_or(error!(MyrmexError::MathOverflow))?;
    } else {
        proposal.votes_against = proposal
            .votes_against
            .checked_add(votes)
            .ok_or(error!(MyrmexError::MathOverflow))?;
    }

    Ok(())
}
