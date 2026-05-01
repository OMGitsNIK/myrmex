use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::MyrmexError;

const NEW_LEN: usize = 227;

#[derive(Accounts)]
pub struct MigratePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: owner + authority verified in handler; raw resize done manually
    #[account(mut, owner = crate::ID)]
    pub pool: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigratePool>) -> Result<()> {
    let pool_info = ctx.accounts.pool.to_account_info();

    // Verify authority field (offset 8, 32 bytes)
    {
        let data = pool_info.try_borrow_data()?;
        require!(data.len() >= 40, MyrmexError::PoolNotActive);
        let mut buf = [0u8; 32];
        buf.copy_from_slice(&data[8..40]);
        require_keys_eq!(
            Pubkey::from(buf),
            ctx.accounts.authority.key(),
            MyrmexError::PoolNotActive
        );
    }

    if pool_info.data_len() >= NEW_LEN {
        msg!("Pool {} already at {} bytes, skipping", pool_info.key(), pool_info.data_len());
        return Ok(());
    }

    // Fund extra rent if needed
    let rent = Rent::get()?;
    let required_lamports = rent.minimum_balance(NEW_LEN);
    let current_lamports = pool_info.lamports();
    if required_lamports > current_lamports {
        let deficit = required_lamports
            .checked_sub(current_lamports)
            .ok_or(error!(MyrmexError::MathOverflow))?;
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: pool_info.clone(),
                },
            ),
            deficit,
        )?;
    }

    // Extend account data; new bytes are zeroed by the Solana runtime
    pool_info.resize(NEW_LEN)?;

    msg!("Pool {} migrated to {} bytes", pool_info.key(), NEW_LEN);
    Ok(())
}
