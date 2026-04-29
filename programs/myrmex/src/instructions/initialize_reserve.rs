/// initialize_reserve — creates the per-pool reserve vault token account.
/// Must be called by the pool authority before policies can route premiums to the reserve.
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::MyrmexError;
use crate::state::RiskPool;

#[derive(Accounts)]
pub struct InitializeReserve<'info> {
    #[account(
        mut,
        constraint = authority.key() == pool.authority @ MyrmexError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    pub pool: Account<'info, RiskPool>,

    #[account(address = pool.usdc_mint @ MyrmexError::Unauthorized)]
    pub usdc_mint: Account<'info, Mint>,

    /// PDA-owned token account — pool PDA is the SPL authority so it can sign
    /// withdrawals via `finalize_payout`.
    #[account(
        init,
        payer = authority,
        token::mint = usdc_mint,
        token::authority = pool,
        seeds = [b"reserve_vault", pool.key().as_ref()],
        bump,
    )]
    pub reserve_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(_ctx: Context<InitializeReserve>) -> Result<()> {
    msg!("Reserve vault initialized");
    Ok(())
}
