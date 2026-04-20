use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::MyrmexError;
use crate::state::RiskPool;

#[derive(Accounts)]
#[instruction(pool_type: u8, pool_name: [u8; 32])]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = RiskPool::LEN,
        seeds = [b"pool", authority.key().as_ref(), &[pool_type]],
        bump
    )]
    pub pool: Account<'info, RiskPool>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = pool,
        seeds = [b"lp_mint", pool.key().as_ref()],
        bump
    )]
    pub lp_token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializePool>, pool_type: u8, pool_name: [u8; 32]) -> Result<()> {
    require!(pool_type <= 6, MyrmexError::PoolNotActive);

    let pool = &mut ctx.accounts.pool;
    pool.authority = ctx.accounts.authority.key();
    pool.pool_type = pool_type;
    pool.pool_name = pool_name;
    pool.usdc_mint = ctx.accounts.usdc_mint.key();
    pool.vault = ctx.accounts.vault.key();
    pool.lp_token_mint = ctx.accounts.lp_token_mint.key();
    pool.total_liquidity = 0;
    pool.total_locked = 0;
    pool.premium_accrued = 0;
    pool.active_policy_count = 0;
    pool.is_active = true;
    pool.bump = ctx.bumps.pool;

    Ok(())
}
