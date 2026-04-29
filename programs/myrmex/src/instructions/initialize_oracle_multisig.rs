use anchor_lang::prelude::*;

use crate::errors::MyrmexError;
use crate::state::{OracleMultisigConfig, RiskPool};

#[derive(Accounts)]
pub struct InitializeOracleMultisig<'info> {
    #[account(
        mut,
        constraint = authority.key() == pool.authority @ MyrmexError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    pub pool: Account<'info, RiskPool>,

    #[account(
        init,
        payer = authority,
        space = OracleMultisigConfig::LEN,
        seeds = [b"oracle_multisig", pool.key().as_ref()],
        bump,
    )]
    pub oracle_multisig_config: Account<'info, OracleMultisigConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeOracleMultisig>,
    signers: [Pubkey; 3],
    threshold: u8,
) -> Result<()> {
    require!((1..=3).contains(&threshold), MyrmexError::InvalidConfig);
    // All signer slots must be non-zero pubkeys
    for s in &signers {
        require!(*s != Pubkey::default(), MyrmexError::InvalidConfig);
    }

    let cfg = &mut ctx.accounts.oracle_multisig_config;
    cfg.pool = ctx.accounts.pool.key();
    cfg.signers = signers;
    cfg.threshold = threshold;
    cfg.bump = ctx.bumps.oracle_multisig_config;

    msg!(
        "Oracle multisig initialized: threshold={}/3 for pool {}",
        threshold,
        ctx.accounts.pool.key()
    );
    Ok(())
}
