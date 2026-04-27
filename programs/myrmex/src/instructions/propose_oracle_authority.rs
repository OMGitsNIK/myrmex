use crate::errors::MyrmexError;
use crate::state::{OracleAuthorityProposal, PoolConfig, RiskPool, ORACLE_TIMELOCK_SECS};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ProposeOracleAuthority<'info> {
    #[account(
        mut,
        constraint = pool.authority == authority.key() @ MyrmexError::Unauthorized
    )]
    pub authority: Signer<'info>,

    pub pool: Account<'info, RiskPool>,

    #[account(
        seeds = [b"pool_config", pool.key().as_ref()],
        bump = pool_config.bump
    )]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(
        init,
        payer = authority,
        space = OracleAuthorityProposal::LEN,
        seeds = [b"oracle_proposal", pool.key().as_ref()],
        bump
    )]
    pub proposal: Account<'info, OracleAuthorityProposal>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ProposeOracleAuthority>, new_oracle: Pubkey) -> Result<()> {
    let clock = Clock::get()?;
    let proposal = &mut ctx.accounts.proposal;
    proposal.pool = ctx.accounts.pool.key();
    proposal.proposed_oracle = new_oracle;
    proposal.effective_at = clock
        .unix_timestamp
        .checked_add(ORACLE_TIMELOCK_SECS)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    proposal.bump = ctx.bumps.proposal;

    msg!(
        "Oracle authority change proposed: {} → {} effective at {}",
        ctx.accounts.pool_config.oracle_authority,
        new_oracle,
        proposal.effective_at
    );
    Ok(())
}
