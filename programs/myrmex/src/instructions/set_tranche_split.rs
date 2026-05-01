/// set_tranche_split — pool authority retroactively allocates existing total_liquidity
/// across the junior / mezzanine / senior tranche fields using basis points.
/// No tokens move; this is a bookkeeping migration for pools funded before tranches.
/// junior_bps + mezzanine_bps + senior_bps must equal 10_000.
use anchor_lang::prelude::*;

use crate::errors::MyrmexError;
use crate::state::RiskPool;

#[derive(Accounts)]
pub struct SetTrancheSplit<'info> {
    #[account(
        mut,
        constraint = authority.key() == pool.authority @ MyrmexError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, RiskPool>,
}

pub fn handler(
    ctx: Context<SetTrancheSplit>,
    junior_bps: u64,
    mezzanine_bps: u64,
    senior_bps: u64,
) -> Result<()> {
    require!(
        junior_bps
            .checked_add(mezzanine_bps)
            .and_then(|s| s.checked_add(senior_bps))
            == Some(10_000),
        MyrmexError::InvalidConfig
    );

    let total = ctx.accounts.pool.total_liquidity;

    let junior = total
        .checked_mul(junior_bps)
        .ok_or(error!(MyrmexError::MathOverflow))?
        .checked_div(10_000)
        .ok_or(error!(MyrmexError::MathOverflow))?;

    let mezzanine = total
        .checked_mul(mezzanine_bps)
        .ok_or(error!(MyrmexError::MathOverflow))?
        .checked_div(10_000)
        .ok_or(error!(MyrmexError::MathOverflow))?;

    // Senior gets remainder to absorb rounding dust
    let senior = total
        .checked_sub(junior)
        .and_then(|r| r.checked_sub(mezzanine))
        .ok_or(error!(MyrmexError::MathOverflow))?;

    let pool = &mut ctx.accounts.pool;
    pool.junior_liquidity = junior;
    pool.mezzanine_liquidity = mezzanine;
    pool.senior_liquidity = senior;

    msg!(
        "Tranche split set: junior={} mez={} senior={} (total={})",
        junior,
        mezzanine,
        senior,
        total
    );
    Ok(())
}
