/// queue_payout — replaces trigger_payout.
/// Validates oracle trigger condition, marks policy claimed, and creates a
/// PendingPayout that enforces a 48-hour delay before USDC actually moves.
/// USDC stays in the pool vault during the delay window so the pool authority
/// can veto before funds leave if a manipulation is detected.
use anchor_lang::prelude::*;

use crate::errors::MyrmexError;
use crate::oracle::verify_trigger;
use crate::state::{OracleReport, PendingPayout, PolicyVault, PoolConfig, RiskPool};

const PAYOUT_DELAY_SECS: i64 = 172_800; // 48 hours

#[derive(Accounts)]
pub struct QueuePayout<'info> {
    /// Permissionless — anyone can queue a payout once conditions are met.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        constraint = policy.is_active   @ MyrmexError::PolicyNotActive,
        constraint = !policy.is_claimed @ MyrmexError::PolicyAlreadyClaimed,
        constraint = policy.pool == pool.key() @ MyrmexError::Unauthorized,
    )]
    pub policy: Account<'info, PolicyVault>,

    #[account(mut)]
    pub pool: Account<'info, RiskPool>,

    #[account(
        constraint = pool_config.pool == pool.key() @ MyrmexError::Unauthorized,
    )]
    pub pool_config: Account<'info, PoolConfig>,

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

    /// CHECK: verified via policy.policyholder constraint
    #[account(
        constraint = policyholder.key() == policy.policyholder @ MyrmexError::Unauthorized,
    )]
    pub policyholder: UncheckedAccount<'info>,

    #[account(
        init,
        payer = caller,
        space = PendingPayout::LEN,
        seeds = [b"pending_payout", policy.key().as_ref()],
        bump,
    )]
    pub pending_payout: Account<'info, PendingPayout>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<QueuePayout>) -> Result<()> {
    let clock = Clock::get()?;

    // CHECKS
    {
        let oracle_report = &ctx.accounts.oracle_report;

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
        require!(
            oracle_report.authority == policy.trigger_condition.oracle_pubkey,
            MyrmexError::WrongOracle
        );

        verify_trigger(
            oracle_report.reported_value,
            policy.trigger_condition.threshold,
            policy.trigger_condition.comparison,
        )?;
    }

    let payout_amount = ctx.accounts.policy.payout_amount;
    let execute_after = clock
        .unix_timestamp
        .checked_add(PAYOUT_DELAY_SECS)
        .ok_or(error!(MyrmexError::MathOverflow))?;

    // EFFECTS: mark claimed before any state change (CEI)
    {
        let policy = &mut ctx.accounts.policy;
        policy.is_claimed = true;
        policy.is_active = false;
    }

    // Create pending payout (no USDC moves yet)
    let pp = &mut ctx.accounts.pending_payout;
    pp.policy = ctx.accounts.policy.key();
    pp.pool = ctx.accounts.pool.key();
    pp.policyholder = ctx.accounts.policyholder.key();
    pp.amount = payout_amount;
    pp.execute_after = execute_after;
    pp.vetoed = false;
    pp.bump = ctx.bumps.pending_payout;

    msg!(
        "Payout queued: {} USDC for {} — executable after {}",
        payout_amount,
        ctx.accounts.policyholder.key(),
        execute_after
    );
    Ok(())
}
