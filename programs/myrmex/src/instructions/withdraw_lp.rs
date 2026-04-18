use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::errors::MyrmexError;
use crate::events::LpWithdrawn;
use crate::state::RiskPool;

#[derive(Accounts)]
pub struct WithdrawLp<'info> {
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
        mut,
        associated_token::mint = lp_token_mint,
        associated_token::authority = provider,
    )]
    pub provider_lp_tokens: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<WithdrawLp>, lp_amount: u64) -> Result<()> {
    require!(lp_amount > 0, MyrmexError::InsufficientLiquidity);

    let lp_supply = ctx.accounts.lp_token_mint.supply;
    let usdc_to_return = ctx
        .accounts
        .pool
        .calculate_usdc_withdrawal(lp_amount, lp_supply)?;

    require!(
        usdc_to_return <= ctx.accounts.pool.available_liquidity(),
        MyrmexError::WithdrawalExceedsAvailable
    );

    // Burn LP tokens
    let burn_cpi = Burn {
        mint: ctx.accounts.lp_token_mint.to_account_info(),
        from: ctx.accounts.provider_lp_tokens.to_account_info(),
        authority: ctx.accounts.provider.to_account_info(),
    };
    token::burn(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), burn_cpi),
        lp_amount,
    )?;

    // Transfer USDC from pool vault to provider — pool PDA signs
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
        to: ctx.accounts.provider_usdc.to_account_info(),
        authority: ctx.accounts.pool.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_cpi,
            signer,
        ),
        usdc_to_return,
    )?;

    // Update pool state
    let pool_key = ctx.accounts.pool.key();
    let pool = &mut ctx.accounts.pool;
    pool.total_liquidity = pool
        .total_liquidity
        .checked_sub(usdc_to_return)
        .ok_or(error!(MyrmexError::MathOverflow))?;

    emit!(LpWithdrawn {
        pool: pool_key,
        provider: ctx.accounts.provider.key(),
        usdc_returned: usdc_to_return,
        lp_tokens_burned: lp_amount,
    });

    Ok(())
}
