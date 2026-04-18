use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::MyrmexError;
use crate::events::PayoutExecuted;
use crate::oracle::verify_trigger;
use crate::state::{PolicyVault, RiskPool};

#[derive(Accounts)]
pub struct TriggerPayout<'info> {
    /// Anyone can call — permissionless payout
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
        mut,
        associated_token::mint = pool.usdc_mint,
        associated_token::authority = policyholder,
    )]
    pub policyholder_usdc: Account<'info, TokenAccount>,

    /// CHECK: Verified inside handler against policy.trigger_condition.oracle_pubkey
    pub oracle_account: UncheckedAccount<'info>,

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

pub fn handler(ctx: Context<TriggerPayout>, oracle_value: i64) -> Result<()> {
    let clock = Clock::get()?;

    // CHECKS
    {
        let policy = &ctx.accounts.policy;
        require!(policy.is_active, MyrmexError::PolicyNotActive);
        require!(!policy.is_claimed, MyrmexError::PolicyAlreadyClaimed);

        // Verify oracle matches policy
        require!(
            ctx.accounts.oracle_account.key() == policy.trigger_condition.oracle_pubkey,
            MyrmexError::WrongOracle
        );

        // Verify trigger condition is met
        verify_trigger(
            oracle_value,
            policy.trigger_condition.threshold,
            policy.trigger_condition.comparison,
        )?;
    }

    // EFFECTS: Set claimed BEFORE any transfer (checks-effects-interactions)
    {
        let policy = &mut ctx.accounts.policy;
        policy.is_claimed = true;
        policy.is_active = false;
    }

    let payout_amount = ctx.accounts.policy.payout_amount;

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
    pool.total_locked = pool.total_locked.saturating_sub(payout_amount);
    pool.total_liquidity = pool.total_liquidity.saturating_sub(payout_amount);
    pool.active_policy_count = pool.active_policy_count.saturating_sub(1);

    emit!(PayoutExecuted {
        policy: ctx.accounts.policy.key(),
        policyholder: ctx.accounts.policyholder.key(),
        payout_amount,
        oracle_value,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
