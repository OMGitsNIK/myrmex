use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::MyrmexError;
use crate::events::PayoutExecuted;
use crate::oracle::verify_trigger;
use crate::state::{OracleReport, PolicyVault, PoolConfig, RiskPool};

#[derive(Accounts)]
pub struct TriggerPayout<'info> {
    /// Permissionless — anyone can execute a payout once a valid oracle report exists.
    /// USDC always goes to policy.policyholder, so front-running is harmless.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        constraint = policy.is_active @ MyrmexError::PolicyNotActive,
        constraint = !policy.is_claimed @ MyrmexError::PolicyAlreadyClaimed,
        constraint = policy.pool == pool.key() @ MyrmexError::Unauthorized,
    )]
    pub policy: Account<'info, PolicyVault>,

    #[account(mut)]
    pub pool: Account<'info, RiskPool>,

    #[account(
        constraint = pool_config.pool == pool.key() @ MyrmexError::Unauthorized,
        constraint = pool_config.demo_mode @ MyrmexError::DemoModeDisabled,
    )]
    pub pool_config: Account<'info, PoolConfig>,

    /// Oracle report posted by the oracle that was authoritative when this policy was created.
    /// Validates against policy.trigger_condition.oracle_pubkey — not the current pool config —
    /// so oracle authority rotation cannot retroactively break in-force policies.
    /// Seeds: [b"oracle_report", pool.key(), policy.trigger_condition.scope_hash]
    #[account(
        seeds = [
            b"oracle_report",
            pool.key().as_ref(),
            policy.trigger_condition.scope_hash.as_ref(),
        ],
        bump = oracle_report.bump,
        constraint = oracle_report.pool == pool.key() @ MyrmexError::WrongOracle,
        constraint = oracle_report.authority == policy.trigger_condition.oracle_pubkey @ MyrmexError::WrongOracle,
        constraint = oracle_report.scope_hash == policy.trigger_condition.scope_hash @ MyrmexError::OracleScopeMismatch,
    )]
    pub oracle_report: Box<Account<'info, OracleReport>>,

    #[account(
        mut,
        associated_token::mint = pool.usdc_mint,
        associated_token::authority = policyholder,
    )]
    pub policyholder_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = pool.vault,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    /// CHECK: Must match policy.policyholder
    #[account(
        constraint = policyholder.key() == policy.policyholder @ MyrmexError::Unauthorized,
    )]
    pub policyholder: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<TriggerPayout>) -> Result<()> {
    let clock = Clock::get()?;

    // CHECKS
    {
        let oracle_report = &ctx.accounts.oracle_report;

        // Oracle report must be fresh and not future-dated.
        // reject if reported_at > now (future-dated would make age=0 with saturating_sub,
        // bypassing the freshness check) and if the report is older than MAX_AGE_SECS.
        require!(
            oracle_report.reported_at <= clock.unix_timestamp,
            MyrmexError::OracleReportStale
        );
        let age = clock
            .unix_timestamp
            .checked_sub(oracle_report.reported_at)
            .ok_or(error!(MyrmexError::MathOverflow))?;
        require!(
            age <= OracleReport::MAX_AGE_SECS,
            MyrmexError::OracleReportStale
        );

        let policy = &ctx.accounts.policy;

        require!(
            clock.unix_timestamp <= policy.expires_at,
            MyrmexError::PolicyExpired
        );
        require!(
            oracle_report.reported_at >= policy.created_at,
            MyrmexError::OracleReportBeforePolicy
        );
        require!(
            oracle_report.reported_at <= policy.expires_at,
            MyrmexError::PolicyExpired
        );

        // The oracle report must have been posted by the same oracle the policyholder
        // trusted at policy creation time (stored in trigger_condition.oracle_pubkey).
        require!(
            ctx.accounts.oracle_report.authority == policy.trigger_condition.oracle_pubkey,
            MyrmexError::WrongOracle
        );

        // Verify the oracle's reported value satisfies this policy's trigger condition
        verify_trigger(
            oracle_report.reported_value,
            policy.trigger_condition.threshold,
            policy.trigger_condition.comparison,
        )?;
    }

    // EFFECTS: Mark claimed BEFORE transfer (CEI pattern — prevents reentrancy)
    {
        let policy = &mut ctx.accounts.policy;
        policy.is_claimed = true;
        policy.is_active = false;
    }

    let payout_amount = ctx.accounts.policy.payout_amount;
    let oracle_value = ctx.accounts.oracle_report.reported_value;

    // INTERACTIONS: Transfer payout from pool vault to policyholder
    let pool_type = ctx.accounts.pool.pool_type;
    let authority_key = ctx.accounts.pool.authority;
    let pool_bump = ctx.accounts.pool.bump;
    let seeds = &[
        b"pool".as_ref(),
        authority_key.as_ref(),
        &[pool_type],
        &[pool_bump],
    ];
    let signer = &[&seeds[..]];

    let transfer_cpi = Transfer {
        from: ctx.accounts.pool_vault.to_account_info(),
        to: ctx.accounts.policyholder_usdc.to_account_info(),
        authority: ctx.accounts.pool.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_cpi,
            signer,
        ),
        payout_amount,
    )?;

    // Update pool state
    let pool = &mut ctx.accounts.pool;
    pool.total_locked = pool
        .total_locked
        .checked_sub(payout_amount)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    pool.total_liquidity = pool
        .total_liquidity
        .checked_sub(payout_amount)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    pool.active_policy_count = pool
        .active_policy_count
        .checked_sub(1)
        .ok_or(error!(MyrmexError::MathOverflow))?;

    emit!(PayoutExecuted {
        policy: ctx.accounts.policy.key(),
        policyholder: ctx.accounts.policyholder.key(),
        payout_amount,
        oracle_value,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
