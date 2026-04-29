/// veto_payout — pool authority can cancel a queued payout within the 48-hour window.
/// Resets the policy to active so it can be re-evaluated. Closes PendingPayout, returning
/// rent to the pool authority.
use anchor_lang::prelude::*;

use crate::errors::MyrmexError;
use crate::state::{PendingPayout, PolicyVault, RiskPool};

#[derive(Accounts)]
pub struct VetoPayout<'info> {
    /// Must be the pool authority
    #[account(
        mut,
        constraint = authority.key() == pool.authority @ MyrmexError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        constraint = pool.key() == pending_payout.pool @ MyrmexError::Unauthorized,
    )]
    pub pool: Account<'info, RiskPool>,

    #[account(
        mut,
        constraint = policy.key() == pending_payout.policy @ MyrmexError::Unauthorized,
    )]
    pub policy: Account<'info, PolicyVault>,

    #[account(
        mut,
        seeds = [b"pending_payout", policy.key().as_ref()],
        bump = pending_payout.bump,
        close = authority,
    )]
    pub pending_payout: Account<'info, PendingPayout>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<VetoPayout>) -> Result<()> {
    let clock = Clock::get()?;

    // Can only veto within the delay window
    require!(
        clock.unix_timestamp < ctx.accounts.pending_payout.execute_after,
        MyrmexError::PayoutDelayPassed
    );

    // Restore policy to active state — pool.total_locked unchanged (still locked)
    let policy = &mut ctx.accounts.policy;
    policy.is_claimed = false;
    policy.is_active = true;

    msg!(
        "Payout vetoed by authority {} for policy {}",
        ctx.accounts.authority.key(),
        ctx.accounts.policy.key()
    );
    Ok(())
}
