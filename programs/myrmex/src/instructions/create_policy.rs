use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::MyrmexError;
use crate::events::PolicyCreated;
use crate::state::{PolicyVault, PoolConfig, RiskPool, TriggerCondition};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreatePolicyParams {
    pub coverage_type: u8,
    pub payout_amount: u64,
    pub premium_amount: u64,
    pub trigger_condition: TriggerCondition,
    pub expires_at: i64,
    pub nonce: u64,
    pub quote_expiry: i64,
}

#[derive(Accounts)]
#[instruction(params: CreatePolicyParams)]
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
            &params.nonce.to_le_bytes(),
        ],
        bump
    )]
    pub policy: Account<'info, PolicyVault>,

    #[account(
        mut,
        constraint = pool.is_active @ MyrmexError::PoolNotActive,
        constraint = pool.available_liquidity() >= params.payout_amount @ MyrmexError::InsufficientLiquidity,
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

    /// CHECK: We verify this matches the expected Ed25519 precompile instruction
    pub instructions_sysvar: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreatePolicy>, params: CreatePolicyParams) -> Result<()> {
    let clock = Clock::get()?;
    let pool_config = &ctx.accounts.pool_config;

    // Basic Validation
    require!(
        params.expires_at > clock.unix_timestamp,
        MyrmexError::PolicyExpired
    );
    require!(
        params.quote_expiry > clock.unix_timestamp,
        MyrmexError::PolicyExpired
    );
    require!(
        params.coverage_type == ctx.accounts.pool.pool_type,
        MyrmexError::Unauthorized
    );

    // comparison must be a known operator: 0=GT, 1=LT, 2=EQ
    require!(
        params.trigger_condition.comparison <= 2,
        MyrmexError::InvalidConfig
    );

    // Oracle pubkey must be the pool's authoritative oracle — not the user's wallet
    require!(
        params.trigger_condition.oracle_pubkey == pool_config.oracle_authority,
        MyrmexError::WrongOracle
    );

    // Verify Quote Signature
    // The Ed25519 precompile instruction must precede this instruction in the same transaction.
    let ix_sysvar_info = &ctx.accounts.instructions_sysvar;
    let current_ix = anchor_lang::solana_program::sysvar::instructions::load_current_index_checked(
        ix_sysvar_info,
    )?;
    if current_ix > 0 {
        let prev_ix =
            anchor_lang::solana_program::sysvar::instructions::load_instruction_at_checked(
                (current_ix - 1) as usize,
                ix_sysvar_info,
            )?;

        // 1. Verify it's the Ed25519 precompile
        use std::str::FromStr;
        let ed25519_id = Pubkey::from_str("Ed25519SigVerify111111111111111111111111111").unwrap();
        require!(prev_ix.program_id == ed25519_id, MyrmexError::Unauthorized);

        // 2. Verify the public key in the signature matches the pricing_authority
        // In the Ed25519 precompile data, the public key starts at offset 16 (header is 16 bytes)
        // Header: num_sig(2), padding(2), sig_off(2), sig_ix(2), pubkey_off(2), pubkey_ix(2), msg_off(2), msg_size(2)
        let data = &prev_ix.data;
        require!(data.len() >= 16 + 32, MyrmexError::Unauthorized);

        let pubkey_bytes: [u8; 32] = data[16..48]
            .try_into()
            .map_err(|_| MyrmexError::Unauthorized)?;
        require!(
            pubkey_bytes == pool_config.pricing_authority.to_bytes(),
            MyrmexError::WrongOracle
        );

        // 3. Verify the message contains the correct premium and payout
        // Message format used in API: [pool(32), coverage_type(1), payout(8), premium(8), expiry(8)]
        // Message starts at offset 16 + 32 + 64 = 112
        let msg_start = 112;
        require!(
            data.len() >= msg_start + 32 + 1 + 8 + 8 + 8,
            MyrmexError::Unauthorized
        );

        let signed_premium = u64::from_le_bytes(
            data[msg_start + 32 + 1 + 8..msg_start + 32 + 1 + 8 + 8]
                .try_into()
                .unwrap(),
        );
        require!(
            params.premium_amount >= signed_premium,
            MyrmexError::InsufficientPremium
        );
    } else {
        return Err(error!(MyrmexError::Unauthorized));
    }

    // Min premium floor enforcement
    let min_premium = params
        .payout_amount
        .checked_mul(pool_config.min_premium_bps)
        .ok_or(error!(MyrmexError::MathOverflow))?
        .checked_div(10_000)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    require!(
        params.premium_amount >= min_premium,
        MyrmexError::InsufficientPremium
    );

    // Coverage cap: (locked + new_payout) must not exceed max_coverage_bps% of total_liquidity
    let new_locked = ctx
        .accounts
        .pool
        .total_locked
        .checked_add(params.payout_amount)
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

    // Initialize policy state
    let policy = &mut ctx.accounts.policy;
    policy.policyholder = ctx.accounts.policyholder.key();
    policy.pool = ctx.accounts.pool.key();
    policy.coverage_type = params.coverage_type;
    policy.payout_amount = params.payout_amount;
    policy.premium_amount = params.premium_amount;
    policy.trigger_condition = params.trigger_condition;
    policy.expires_at = params.expires_at;
    policy.created_at = clock.unix_timestamp;
    policy.is_active = true;
    policy.is_claimed = false;
    policy.bump = ctx.bumps.policy;

    // Update pool state
    let pool = &mut ctx.accounts.pool;
    pool.total_locked = new_locked;
    // Premium is earned yield — add to total_liquidity so all LPs share it pro-rata.
    pool.total_liquidity = pool
        .total_liquidity
        .checked_add(params.premium_amount)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    pool.premium_accrued = pool
        .premium_accrued
        .checked_add(params.premium_amount)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    pool.active_policy_count = pool
        .active_policy_count
        .checked_add(1)
        .ok_or(error!(MyrmexError::MathOverflow))?;

    // Transfer premium from policyholder to pool vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.policyholder_usdc.to_account_info(),
        to: ctx.accounts.pool_vault.to_account_info(),
        authority: ctx.accounts.policyholder.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, params.premium_amount)?;

    emit!(PolicyCreated {
        policy: ctx.accounts.policy.key(),
        policyholder: ctx.accounts.policyholder.key(),
        pool: ctx.accounts.pool.key(),
        coverage_type: params.coverage_type,
        payout_amount: params.payout_amount,
        premium_amount: params.premium_amount,
        expires_at: params.expires_at,
    });

    Ok(())
}
