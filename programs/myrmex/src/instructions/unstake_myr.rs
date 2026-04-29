use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::MyrmexError;
use crate::events::MyrUnstaked;
use crate::state::StakeAccount;

#[derive(Accounts)]
pub struct UnstakeMyr<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stake", owner.key().as_ref()],
        bump = stake_account.bump,
        constraint = stake_account.owner == owner.key() @ MyrmexError::Unauthorized,
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
        mut,
        associated_token::mint = myr_mint,
        associated_token::authority = stake_account,
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UnstakeMyr>, amount: u64) -> Result<()> {
    require!(amount > 0, MyrmexError::InsufficientLiquidity);

    let clock = Clock::get()?;
    let stake = &ctx.accounts.stake_account;

    require!(
        clock.unix_timestamp >= stake.lock_until,
        MyrmexError::LockNotExpired
    );
    require!(
        stake.amount_staked >= amount,
        MyrmexError::InsufficientLiquidity
    );

    // EFFECTS: decrement before CPI
    let stake = &mut ctx.accounts.stake_account;
    stake.amount_staked = stake
        .amount_staked
        .checked_sub(amount)
        .ok_or(error!(MyrmexError::MathOverflow))?;

    // INTERACTIONS: PDA-signed transfer from stake vault back to owner
    let owner_key = ctx.accounts.owner.key();
    let bump = ctx.accounts.stake_account.bump;
    let seeds = &[b"stake".as_ref(), owner_key.as_ref(), &[bump]];
    let signer = &[&seeds[..]];

    let transfer_cpi = Transfer {
        from: ctx.accounts.stake_vault.to_account_info(),
        to: ctx.accounts.owner_myr.to_account_info(),
        authority: ctx.accounts.stake_account.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_cpi,
            signer,
        ),
        amount,
    )?;

    emit!(MyrUnstaked {
        owner: ctx.accounts.owner.key(),
        amount,
        remaining_staked: ctx.accounts.stake_account.amount_staked,
    });

    Ok(())
}
