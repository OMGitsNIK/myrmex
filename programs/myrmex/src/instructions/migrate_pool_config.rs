use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::MyrmexError;

const NEW_LEN: usize = 98;
// Byte offset of demo_mode in the new layout:
// 8 disc + 32 pool + 32 oracle_authority + 8 min_premium + 8 max_coverage + 1 bump + 8 reserve = 97
const DEMO_MODE_OFFSET: usize = 97;

#[derive(Accounts)]
pub struct MigratePoolConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: raw resize; pool ownership verified against pool_config bytes
    #[account(mut, owner = crate::ID)]
    pub pool_config: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigratePoolConfig>) -> Result<()> {
    let cfg_info = ctx.accounts.pool_config.to_account_info();

    if cfg_info.data_len() >= NEW_LEN {
        msg!(
            "PoolConfig {} already {} bytes, skipping",
            cfg_info.key(),
            cfg_info.data_len()
        );
        return Ok(());
    }

    // Fund extra rent if needed
    let rent = Rent::get()?;
    let required_lamports = rent.minimum_balance(NEW_LEN);
    let current_lamports = cfg_info.lamports();
    if required_lamports > current_lamports {
        let deficit = required_lamports
            .checked_sub(current_lamports)
            .ok_or(error!(MyrmexError::MathOverflow))?;
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: cfg_info.clone(),
                },
            ),
            deficit,
        )?;
    }

    // Extend; Solana runtime zeros new bytes (reserve_balance = 0 is correct)
    cfg_info.resize(NEW_LEN)?;

    // demo_mode defaults false after zero-init; set it to true for devnet
    {
        let mut data = cfg_info.try_borrow_mut_data()?;
        data[DEMO_MODE_OFFSET] = 1u8;
    }

    msg!("PoolConfig {} migrated to {} bytes (demo_mode=true)", cfg_info.key(), NEW_LEN);
    Ok(())
}
