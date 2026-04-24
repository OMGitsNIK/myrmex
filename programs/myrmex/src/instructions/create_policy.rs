use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::MyrmexError;
use crate::events::PolicyCreated;
use crate::state::{PolicyVault, PoolConfig, RiskPool, TriggerCondition};

#[derive(Accounts)]
#[instruction(
    coverage_type: u8,
    payout_amount: u64,
    premium_amount: u64,
    trigger_condition: TriggerCondition,
    expires_at: i64,
    nonce: i64
)]
pub struct CreatePolicy<'info> {
    #[account(mut)]
    pub policyholder: Signer<'info>,

    #[account(
        init,
        payer = policyholder,
        space = PolicyVault::LEN,
        seeds = [
            b"policy",
            policyholder.key().as_ref(),
            pool.key().as_ref(),
            &nonce.to_le_bytes(),
        ],
        bump
    )]
    pub policy: Account<'info, PolicyVault>,

    #[account(
        mut,
        constraint = pool.is_active @ MyrmexError::PoolNotActive,
        constraint = pool.available_liquidity() >= payout_amount @ MyrmexError::InsufficientLiquidity,
    )]
    pub pool: Account<'info, RiskPool>,

    #[account(
        constraint = pool_config.pool == pool.key() @ MyrmexError::Unauthorized,
    )]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = policyholder,
    )]
    pub policyholder_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = pool.vault,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreatePolicy>,
    coverage_type: u8,
    payout_amount: u64,
    premium_amount: u64,
    trigger_condition: TriggerCondition,
    expires_at: i64,
    _nonce: i64,
) -> Result<()> {
    let clock = Clock::get()?;
    let pool_config = &ctx.accounts.pool_config;

    require!(
        expires_at > clock.unix_timestamp,
        MyrmexError::PolicyExpired
    );
    require!(
        coverage_type == ctx.accounts.pool.pool_type,
        MyrmexError::Unauthorized
    );

    // comparison must be a known operator: 0=GT, 1=LT, 2=EQ
    require!(
        trigger_condition.comparison <= 2,
        MyrmexError::InvalidConfig
    );

    // Oracle pubkey must be the pool's authoritative oracle — not the user's wallet
    require!(
        trigger_condition.oracle_pubkey == pool_config.oracle_authority,
        MyrmexError::WrongOracle
    );

    // Premium must meet the pool's minimum floor (min_premium_bps of payout).
    // Ceiling division prevents rounding down to below the true minimum.
    let numerator = payout_amount
        .checked_mul(pool_config.min_premium_bps)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    let min_premium = numerator
        .checked_add(9_999)
        .ok_or(error!(MyrmexError::MathOverflow))?
        .checked_div(10_000)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    require!(
        premium_amount >= min_premium,
        MyrmexError::InsufficientPremium
    );

    // Coverage cap: (locked + new_payout) must not exceed max_coverage_bps% of total_liquidity
    let new_locked = ctx
        .accounts
        .pool
        .total_locked
        .checked_add(payout_amount)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    let max_locked = ctx
        .accounts
        .pool
        .total_liquidity
        .checked_mul(pool_config.max_coverage_bps)
        .ok_or(error!(MyrmexError::MathOverflow))?
        .checked_div(10_000)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    require!(new_locked <= max_locked, MyrmexError::CoverageCapExceeded);

    // Transfer premium USDC from policyholder to pool vault
    let transfer_cpi = Transfer {
        from: ctx.accounts.policyholder_usdc.to_account_info(),
        to: ctx.accounts.pool_vault.to_account_info(),
        authority: ctx.accounts.policyholder.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_cpi),
        premium_amount,
    )?;

    // Initialize policy vault
    let policy = &mut ctx.accounts.policy;
    policy.policyholder = ctx.accounts.policyholder.key();
    policy.pool = ctx.accounts.pool.key();
    policy.coverage_type = coverage_type;
    policy.payout_amount = payout_amount;
    policy.premium_amount = premium_amount;
    policy.trigger_condition = trigger_condition;
    policy.expires_at = expires_at;
    policy.created_at = clock.unix_timestamp;
    policy.is_active = true;
    policy.is_claimed = false;
    policy.bump = ctx.bumps.policy;

    // Update pool state
    let pool_key = ctx.accounts.pool.key();
    let pool = &mut ctx.accounts.pool;
    pool.total_locked = pool
        .total_locked
        .checked_add(payout_amount)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    // Premium is earned yield — add to total_liquidity so all LPs share it pro-rata.
    pool.total_liquidity = pool
        .total_liquidity
        .checked_add(premium_amount)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    pool.premium_accrued = pool
        .premium_accrued
        .checked_add(premium_amount)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    pool.active_policy_count = pool
        .active_policy_count
        .checked_add(1)
        .ok_or(error!(MyrmexError::MathOverflow))?;

    emit!(PolicyCreated {
        policy: ctx.accounts.policy.key(),
        policyholder: ctx.accounts.policyholder.key(),
        pool: pool_key,
        coverage_type,
        payout_amount,
        premium_amount,
        expires_at,
    });

    Ok(())
}
