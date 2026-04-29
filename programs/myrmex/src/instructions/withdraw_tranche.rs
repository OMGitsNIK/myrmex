/// withdraw_tranche — burn LP tokens and withdraw USDC from a specific tranche.
/// Cannot withdraw more than the tranche's available (unlocked) liquidity.
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::errors::MyrmexError;
use crate::state::RiskPool;

#[derive(Accounts)]
pub struct WithdrawTranche<'info> {
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

pub fn handler(ctx: Context<WithdrawTranche>, lp_amount: u64, tranche: u8) -> Result<()> {
    require!(tranche <= 2, MyrmexError::InvalidTranche);
    require!(lp_amount > 0, MyrmexError::InsufficientLiquidity);

    let lp_supply = ctx.accounts.lp_token_mint.supply;
    let usdc_to_return = ctx
        .accounts
        .pool
        .calculate_usdc_withdrawal(lp_amount, lp_supply)?;

    // Check the specific tranche has enough unlocked liquidity
    let tranche_available = match tranche {
        0 => ctx.accounts.pool.junior_liquidity,
        1 => ctx.accounts.pool.mezzanine_liquidity,
        _ => ctx.accounts.pool.senior_liquidity,
    };
    // Cannot withdraw more than this tranche holds (locked policies reduce all tranches proportionally)
    require!(
        usdc_to_return <= tranche_available,
        MyrmexError::InsufficientTrancheLiquidity
    );
    // Also enforce overall pool availability
    require!(
        usdc_to_return <= ctx.accounts.pool.available_liquidity(),
        MyrmexError::WithdrawalExceedsAvailable
    );

    // Burn LP tokens
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.lp_token_mint.to_account_info(),
                from: ctx.accounts.provider_lp_tokens.to_account_info(),
                authority: ctx.accounts.provider.to_account_info(),
            },
        ),
        lp_amount,
    )?;

    // Transfer USDC from pool vault — pool PDA signs
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

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_vault.to_account_info(),
                to: ctx.accounts.provider_usdc.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer,
        ),
        usdc_to_return,
    )?;

    // Update pool state
    let pool = &mut ctx.accounts.pool;
    pool.total_liquidity = pool
        .total_liquidity
        .checked_sub(usdc_to_return)
        .ok_or(error!(MyrmexError::MathOverflow))?;

    match tranche {
        0 => {
            pool.junior_liquidity = pool
                .junior_liquidity
                .checked_sub(usdc_to_return)
                .ok_or(error!(MyrmexError::MathOverflow))?;
        }
        1 => {
            pool.mezzanine_liquidity = pool
                .mezzanine_liquidity
                .checked_sub(usdc_to_return)
                .ok_or(error!(MyrmexError::MathOverflow))?;
        }
        _ => {
            pool.senior_liquidity = pool
                .senior_liquidity
                .checked_sub(usdc_to_return)
                .ok_or(error!(MyrmexError::MathOverflow))?;
        }
    }

    msg!(
        "Tranche {} withdrawal: {} USDC for {} LP burned",
        tranche,
        usdc_to_return,
        lp_amount
    );
    Ok(())
}
