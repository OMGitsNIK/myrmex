use anchor_lang::prelude::*;
use crate::state::{PoolConfig, RiskPool};
use crate::errors::MyrmexError;

#[derive(Accounts)]
pub struct InitializePoolConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        constraint = pool.authority == authority.key() @ MyrmexError::Unauthorized,
    )]
    pub pool: Account<'info, RiskPool>,

    #[account(
        init,
        payer = authority,
        space = PoolConfig::LEN,
        seeds = [b"pool_config", pool.key().as_ref()],
        bump
    )]
    pub pool_config: Account<'info, PoolConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializePoolConfig>,
    oracle_authority: Pubkey,
    min_premium_bps: u64,
    max_coverage_bps: u64,
) -> Result<()> {
    require!(min_premium_bps <= 10_000, MyrmexError::InvalidConfig);
    require!(max_coverage_bps > 0 && max_coverage_bps <= 10_000, MyrmexError::InvalidConfig);

    let config = &mut ctx.accounts.pool_config;
    config.pool = ctx.accounts.pool.key();
    config.oracle_authority = oracle_authority;
    config.min_premium_bps = min_premium_bps;
    config.max_coverage_bps = max_coverage_bps;
    config.bump = ctx.bumps.pool_config;

    Ok(())
}
