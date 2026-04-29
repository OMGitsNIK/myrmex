/// toggle_pool_active — emergency pause/resume for a pool.
/// Only the pool authority can call this. Pausing prevents new policy creation
/// while leaving existing policies and payouts unaffected.
use anchor_lang::prelude::*;

use crate::errors::MyrmexError;
use crate::state::RiskPool;

#[derive(Accounts)]
pub struct TogglePoolActive<'info> {
    #[account(
        mut,
        constraint = authority.key() == pool.authority @ MyrmexError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, RiskPool>,
}

pub fn handler(ctx: Context<TogglePoolActive>, active: bool) -> Result<()> {
    ctx.accounts.pool.is_active = active;
    msg!(
        "Pool {} set to {}",
        ctx.accounts.pool.key(),
        if active { "ACTIVE" } else { "PAUSED" }
    );
    Ok(())
}
