use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::MyrmexError;
use crate::events::MyrStaked;
use crate::state::StakeAccount;

#[derive(Accounts)]
pub struct StakeMyr<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init_if_needed,
        payer = owner,
        space = StakeAccount::LEN,
        seeds = [b"stake", owner.key().as_ref()],
        bump,
    )]
    pub stake_account: Account<'info, StakeAccount>,

    pub myr_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = myr_mint,
        associated_token::authority = owner,
    )]
    pub owner_myr: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = myr_mint,
        associated_token::authority = stake_account,
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<StakeMyr>, amount: u64) -> Result<()> {
    require!(amount > 0, MyrmexError::InsufficientLiquidity);

    // Transfer $MYR from owner to stake vault
    let transfer_cpi = Transfer {
        from: ctx.accounts.owner_myr.to_account_info(),
        to: ctx.accounts.stake_vault.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_cpi),
        amount,
    )?;

    let clock = Clock::get()?;
    let stake = &mut ctx.accounts.stake_account;
    stake.owner = ctx.accounts.owner.key();
    stake.amount_staked = stake
        .amount_staked
        .checked_add(amount)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    stake.staked_at = clock.unix_timestamp;
    // Lock for 7 days
    stake.lock_until = clock
        .unix_timestamp
        .checked_add(7 * 86400)
        .ok_or(error!(MyrmexError::MathOverflow))?;
    if stake.bump == 0 {
        stake.bump = ctx.bumps.stake_account;
    }

    emit!(MyrStaked {
        owner: ctx.accounts.owner.key(),
        amount,
        total_staked: stake.amount_staked,
        lock_until: stake.lock_until,
    });

    Ok(())
}
