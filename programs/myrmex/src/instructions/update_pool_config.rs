use crate::errors::MyrmexError;
use crate::state::{PoolConfig, RiskPool};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdatePoolConfig<'info> {
    #[account(
        mut,
        constraint = pool.authority == authority.key() @ MyrmexError::Unauthorized
    )]
    pub authority: Signer<'info>,

    pub pool: Account<'info, RiskPool>,

    #[account(
        mut,
        seeds = [b"pool_config", pool.key().as_ref()],
        bump = pool_config.bump
    )]
    pub pool_config: Account<'info, PoolConfig>,
}

pub fn handler(
    ctx: Context<UpdatePoolConfig>,
    min_premium_bps: u64,
    max_coverage_bps: u64,
    pricing_authority: Pubkey,
) -> Result<()> {
    require!(
        (50..=10_000).contains(&min_premium_bps),
        MyrmexError::InvalidConfig
    );
    require!(
        max_coverage_bps > 0 && max_coverage_bps <= 10_000,
        MyrmexError::InvalidConfig
    );
    // min_premium_bps can only increase — lowering it is a rug vector.
    require!(
        min_premium_bps >= ctx.accounts.pool_config.min_premium_bps,
        MyrmexError::InvalidConfig
    );

    let config = &mut ctx.accounts.pool_config;
    config.min_premium_bps = min_premium_bps;
    config.max_coverage_bps = max_coverage_bps;
    config.pricing_authority = pricing_authority;

    Ok(())
}
