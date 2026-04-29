use crate::errors::MyrmexError;
use crate::state::{OracleMultisigConfig, OracleReport, PoolConfig, RiskPool};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(reported_value: i64, scope_hash: [u8; 32], description: [u8; 192])]
pub struct PostOracleReport<'info> {
    /// Primary oracle authority — must match pool_config.oracle_authority
    #[account(mut)]
    pub oracle_authority: Signer<'info>,

    /// Optional second signer for 2-of-3 multi-sig. Must be in the multisig signer list
    /// and different from oracle_authority. Required when oracle_multisig_config.threshold >= 2.
    pub secondary_oracle: Option<Signer<'info>>,

    pub pool: Account<'info, RiskPool>,

    #[account(
        constraint = pool_config.pool == pool.key() @ MyrmexError::Unauthorized,
        constraint = pool_config.oracle_authority == oracle_authority.key() @ MyrmexError::Unauthorized,
    )]
    pub pool_config: Account<'info, PoolConfig>,

    /// Optional multisig config — when present enforces threshold signing.
    #[account(
        seeds = [b"oracle_multisig", pool.key().as_ref()],
        bump = oracle_multisig_config.bump,
        constraint = oracle_multisig_config.pool == pool.key() @ MyrmexError::Unauthorized,
    )]
    pub oracle_multisig_config: Option<Account<'info, OracleMultisigConfig>>,

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

    // Enforce multisig threshold when config is present
    if let Some(multisig) = &ctx.accounts.oracle_multisig_config {
        if multisig.threshold >= 2 {
            let secondary = ctx
                .accounts
                .secondary_oracle
                .as_ref()
                .ok_or(error!(MyrmexError::MultisigThresholdNotMet))?;
            let sec_key = secondary.key();
            // Secondary must differ from primary
            require!(
                sec_key != ctx.accounts.oracle_authority.key(),
                MyrmexError::MultisigThresholdNotMet
            );
            // Both must be in the registered signer set
            require!(
                multisig
                    .signers
                    .contains(&ctx.accounts.oracle_authority.key()),
                MyrmexError::MultisigThresholdNotMet
            );
            require!(
                multisig.signers.contains(&sec_key),
                MyrmexError::MultisigThresholdNotMet
            );
        }
    }

    let report = &mut ctx.accounts.oracle_report;

    // Enforce monotonicity: each new report must be strictly newer than the
    // previous one. This prevents backdating and silent data replacement.
    require!(
        clock.unix_timestamp > report.reported_at,
        MyrmexError::OracleReportNotNewer
    );

    report.authority = ctx.accounts.oracle_authority.key();
    report.pool = ctx.accounts.pool.key();
    report.scope_hash = scope_hash;
    report.reported_value = reported_value;
    report.reported_at = clock.unix_timestamp;
    report.description = description;
    report.bump = ctx.bumps.oracle_report;

    Ok(())
}
