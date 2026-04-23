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
    oracle_authority: Pubkey,
    min_premium_bps: u64,
    max_coverage_bps: u64,
) -> Result<()> {
    require!(min_premium_bps <= 10_000, MyrmexError::InvalidConfig);
    require!(
        max_coverage_bps > 0 && max_coverage_bps <= 10_000,
        MyrmexError::InvalidConfig
    );

    let config = &mut ctx.accounts.pool_config;
    config.oracle_authority = oracle_authority;
    config.min_premium_bps = min_premium_bps;
    config.max_coverage_bps = max_coverage_bps;

    Ok(())
}
