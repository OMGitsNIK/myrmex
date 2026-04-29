use anchor_lang::prelude::*;

use crate::errors::MyrmexError;
use crate::state::PolicyVault;

#[derive(Accounts)]
#[instruction(nonce: i64)]
pub struct ClosePolicy<'info> {
    #[account(mut)]
    pub policyholder: Signer<'info>,

    // Policy must be inactive (expired or claimed) before it can be closed.
    // Anchor transfers rent lamports to policyholder on close.
    #[account(
        mut,
        seeds = [
            b"policy",
            policyholder.key().as_ref(),
            policy.pool.as_ref(),
            &nonce.to_le_bytes(),
        ],
        bump = policy.bump,
        constraint = policy.policyholder == policyholder.key() @ MyrmexError::Unauthorized,
        constraint = !policy.is_active @ MyrmexError::PolicyNotExpired,
        close = policyholder,
    )]
    pub policy: Account<'info, PolicyVault>,

    pub system_program: Program<'info, System>,
}

pub fn handler(_ctx: Context<ClosePolicy>, _nonce: i64) -> Result<()> {
    Ok(())
}
