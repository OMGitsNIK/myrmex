use anchor_lang::prelude::*;

use crate::errors::MyrmexError;
use crate::events::PolicyExpired;
use crate::state::{PolicyVault, RiskPool};

#[derive(Accounts)]
pub struct ExpirePolicy<'info> {
    /// Anyone can call (keeper/cron incentive)
    pub caller: Signer<'info>,

    #[account(
        mut,
        constraint = policy.is_active @ MyrmexError::PolicyNotActive,
        constraint = policy.pool == pool.key() @ MyrmexError::Unauthorized,
    )]
    pub policy: Account<'info, PolicyVault>,

    #[account(mut)]
    pub pool: Account<'info, RiskPool>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ExpirePolicy>) -> Result<()> {
    let clock = Clock::get()?;

    require!(ctx.accounts.policy.is_active, MyrmexError::PolicyNotActive);
    require!(
        clock.unix_timestamp >= ctx.accounts.policy.expires_at,
        MyrmexError::PolicyNotExpired
    );

    let payout_amount = ctx.accounts.policy.payout_amount;
    let pool_key = ctx.accounts.pool.key();

    // Mark policy inactive
    let policy = &mut ctx.accounts.policy;
    policy.is_active = false;

    // Free locked collateral — premiums remain in pool as yield for LPs
    let pool = &mut ctx.accounts.pool;
    pool.total_locked = pool.total_locked.saturating_sub(payout_amount);
    pool.active_policy_count = pool.active_policy_count.saturating_sub(1);

    emit!(PolicyExpired {
        policy: ctx.accounts.policy.key(),
        pool: pool_key,
        premium_distributed: ctx.accounts.policy.premium_amount,
    });

    Ok(())
}
