use anchor_lang::prelude::*;
use crate::errors::MyrmexError;
use crate::state::{OracleReport, PoolConfig, RiskPool};

#[derive(Accounts)]
#[instruction(reported_value: i64, scope_hash: [u8; 32], description: [u8; 192])]
pub struct PostOracleReport<'info> {
    /// The oracle authority — must match pool_config.oracle_authority
    #[account(mut)]
    pub oracle_authority: Signer<'info>,

    pub pool: Account<'info, RiskPool>,

    #[account(
        constraint = pool_config.pool == pool.key() @ MyrmexError::Unauthorized,
        constraint = pool_config.oracle_authority == oracle_authority.key() @ MyrmexError::Unauthorized,
    )]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(
        init_if_needed,
        payer = oracle_authority,
        space = OracleReport::LEN,
        seeds = [b"oracle_report", pool.key().as_ref(), scope_hash.as_ref()],
        bump
    )]
    pub oracle_report: Account<'info, OracleReport>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<PostOracleReport>,
    reported_value: i64,
    scope_hash: [u8; 32],
    description: [u8; 192],
) -> Result<()> {
    let clock = Clock::get()?;
    let report = &mut ctx.accounts.oracle_report;

    report.authority = ctx.accounts.oracle_authority.key();
    report.pool = ctx.accounts.pool.key();
    report.scope_hash = scope_hash;
    report.reported_value = reported_value;
    report.reported_at = clock.unix_timestamp;
    report.description = description;
    report.bump = ctx.bumps.oracle_report;

    Ok(())
}
