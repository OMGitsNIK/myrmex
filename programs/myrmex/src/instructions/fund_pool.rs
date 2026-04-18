use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::errors::MyrmexError;
use crate::events::PoolFunded;
use crate::state::RiskPool;

#[derive(Accounts)]
pub struct FundPool<'info> {
    #[account(mut)]
    pub provider: Signer<'info>,

    #[account(
        mut,
        constraint = pool.is_active @ MyrmexError::PoolNotActive,
    )]
    pub pool: Account<'info, RiskPool>,

    #[account(
        mut,
        associated_token::mint = pool.usdc_mint,
        associated_token::authority = provider,
    )]
    pub provider_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = pool.vault,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = pool.lp_token_mint,
    )]
    pub lp_token_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = provider,
        associated_token::mint = lp_token_mint,
        associated_token::authority = provider,
    )]
    pub provider_lp_tokens: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<FundPool>, amount: u64) -> Result<()> {
    require!(amount > 0, MyrmexError::InsufficientLiquidity);

    let lp_supply = ctx.accounts.lp_token_mint.supply;
    let lp_to_mint = ctx.accounts.pool.calculate_lp_tokens(amount, lp_supply)?;

    // Transfer USDC from provider to pool vault
    let transfer_cpi = Transfer {
        from: ctx.accounts.provider_usdc.to_account_info(),
        to: ctx.accounts.pool_vault.to_account_info(),
        authority: ctx.accounts.provider.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_cpi),
        amount,
    )?;

    // Mint LP tokens — pool PDA is mint authority
    let pool_key = ctx.accounts.pool.key();
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

    let mint_cpi = MintTo {
        mint: ctx.accounts.lp_token_mint.to_account_info(),
        to: ctx.accounts.provider_lp_tokens.to_account_info(),
        authority: ctx.accounts.pool.to_account_info(),
    };
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            mint_cpi,
            signer,
        ),
        lp_to_mint,
    )?;

    // Update pool state
    let pool = &mut ctx.accounts.pool;
    pool.total_liquidity = pool
        .total_liquidity
        .checked_add(amount)
        .ok_or(error!(MyrmexError::MathOverflow))?;

    emit!(PoolFunded {
        pool: pool_key,
        provider: ctx.accounts.provider.key(),
        usdc_amount: amount,
        lp_tokens_minted: lp_to_mint,
    });

    Ok(())
}
