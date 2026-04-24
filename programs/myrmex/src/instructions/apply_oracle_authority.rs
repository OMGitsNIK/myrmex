use crate::errors::MyrmexError;
use crate::state::{OracleAuthorityProposal, PoolConfig, RiskPool};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ApplyOracleAuthority<'info> {
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

    #[account(
        mut,
        seeds = [b"oracle_proposal", pool.key().as_ref()],
        bump = proposal.bump,
        constraint = proposal.pool == pool.key() @ MyrmexError::Unauthorized,
        close = authority
    )]
    pub proposal: Account<'info, OracleAuthorityProposal>,
}

pub fn handler(ctx: Context<ApplyOracleAuthority>) -> Result<()> {
    let clock = Clock::get()?;
    let proposal = &ctx.accounts.proposal;

    require!(
        clock.unix_timestamp >= proposal.effective_at,
        MyrmexError::TimelockNotExpired
    );

    let old = ctx.accounts.pool_config.oracle_authority;
    ctx.accounts.pool_config.oracle_authority = proposal.proposed_oracle;

    msg!(
        "Oracle authority updated: {} → {}",
        old,
        proposal.proposed_oracle
    );
    Ok(())
}
