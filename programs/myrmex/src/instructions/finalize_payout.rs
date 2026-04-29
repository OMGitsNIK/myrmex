/// finalize_payout — executes the queued USDC transfer after the 48-hour delay.
/// Also implements the reserve-fund backstop (Feature 3) and tranche waterfall (Feature 5).
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::MyrmexError;
use crate::events::PayoutExecuted;
use crate::state::{PendingPayout, PolicyVault, PoolConfig, RiskPool};

#[derive(Accounts)]
pub struct FinalizePayout<'info> {
    /// Permissionless — anyone can finalize after the delay expires.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pending_payout", policy.key().as_ref()],
        bump = pending_payout.bump,
        constraint = !pending_payout.vetoed @ MyrmexError::PayoutVetoed,
        close = policyholder,
    )]
    pub pending_payout: Box<Account<'info, PendingPayout>>,

    #[account(
        mut,
        constraint = policy.key() == pending_payout.policy @ MyrmexError::Unauthorized,
    )]
    pub policy: Box<Account<'info, PolicyVault>>,

    #[account(
        mut,
        constraint = pool.key() == pending_payout.pool @ MyrmexError::Unauthorized,
    )]
    pub pool: Box<Account<'info, RiskPool>>,

    #[account(
        mut,
        seeds = [b"pool_config", pool.key().as_ref()],
        bump = pool_config.bump,
        constraint = pool_config.pool == pool.key() @ MyrmexError::Unauthorized,
    )]
    pub pool_config: Box<Account<'info, PoolConfig>>,

    #[account(
        mut,
        associated_token::mint = pool.usdc_mint,
        associated_token::authority = policyholder,
    )]
    pub policyholder_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = pool.vault,
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    // Reserve vault backstop (optional — initialized by initialize_reserve)
    #[account(
        mut,
        seeds = [b"reserve_vault", pool.key().as_ref()],
        bump,
        token::mint = pool.usdc_mint,
        token::authority = pool,
    )]
    pub reserve_vault: Option<Account<'info, TokenAccount>>,

    /// CHECK: must match pending_payout.policyholder
    #[account(
        mut,
        constraint = policyholder.key() == pending_payout.policyholder @ MyrmexError::Unauthorized,
    )]
    pub policyholder: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<FinalizePayout>) -> Result<()> {
    let clock = Clock::get()?;

    // CHECKS
    require!(
        !ctx.accounts.pending_payout.vetoed,
        MyrmexError::PayoutVetoed
    );
    require!(
        clock.unix_timestamp >= ctx.accounts.pending_payout.execute_after,
        MyrmexError::TimelockNotExpired
    );

    let payout_amount = ctx.accounts.pending_payout.amount;

    // Pool PDA signer seeds
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

    // Compute waterfall split: pool_vault first (using tranche order), then reserve
    let pool_vault_balance = ctx.accounts.pool_vault.amount;
    let (from_pool, from_reserve) = if pool_vault_balance >= payout_amount {
        (payout_amount, 0u64)
    } else {
        let shortfall = payout_amount
            .checked_sub(pool_vault_balance)
            .ok_or(error!(MyrmexError::MathOverflow))?;
        (pool_vault_balance, shortfall)
    };

    // EFFECTS: update pool state BEFORE CPIs (CEI)
    {
        let pool = &mut ctx.accounts.pool;

        // Tranche waterfall: drain junior → mezzanine → senior proportionally
        let mut remaining = from_pool;
        let junior_drain = remaining.min(pool.junior_liquidity);
        pool.junior_liquidity = pool
            .junior_liquidity
            .checked_sub(junior_drain)
            .ok_or(error!(MyrmexError::MathOverflow))?;
        remaining = remaining
            .checked_sub(junior_drain)
            .ok_or(error!(MyrmexError::MathOverflow))?;

        let mez_drain = remaining.min(pool.mezzanine_liquidity);
        pool.mezzanine_liquidity = pool
            .mezzanine_liquidity
            .checked_sub(mez_drain)
            .ok_or(error!(MyrmexError::MathOverflow))?;
        remaining = remaining
            .checked_sub(mez_drain)
            .ok_or(error!(MyrmexError::MathOverflow))?;

        let senior_drain = remaining.min(pool.senior_liquidity);
        pool.senior_liquidity = pool
            .senior_liquidity
            .checked_sub(senior_drain)
            .ok_or(error!(MyrmexError::MathOverflow))?;

        pool.total_locked = pool
            .total_locked
            .checked_sub(payout_amount)
            .ok_or(error!(MyrmexError::MathOverflow))?;
        pool.total_liquidity = pool
            .total_liquidity
            .checked_sub(from_pool)
            .ok_or(error!(MyrmexError::MathOverflow))?;
        pool.active_policy_count = pool
            .active_policy_count
            .checked_sub(1)
            .ok_or(error!(MyrmexError::MathOverflow))?;
    }

    if from_reserve > 0 {
        let pc = &mut ctx.accounts.pool_config;
        pc.reserve_balance = pc
            .reserve_balance
            .checked_sub(from_reserve)
            .ok_or(error!(MyrmexError::MathOverflow))?;
    }

    // INTERACTIONS: pool vault transfer
    if from_pool > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_vault.to_account_info(),
                    to: ctx.accounts.policyholder_usdc.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer,
            ),
            from_pool,
        )?;
    }

    // Reserve vault backstop transfer
    if from_reserve > 0 {
        require!(
            ctx.accounts.reserve_vault.is_some(),
            MyrmexError::InsufficientLiquidity
        );
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx
                        .accounts
                        .reserve_vault
                        .as_ref()
                        .unwrap()
                        .to_account_info(),
                    to: ctx.accounts.policyholder_usdc.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer,
            ),
            from_reserve,
        )?;
    }

    emit!(PayoutExecuted {
        policy: ctx.accounts.policy.key(),
        policyholder: ctx.accounts.policyholder.key(),
        payout_amount,
        oracle_value: 0, // value not stored on pending payout; use queue_payout logs
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "Payout finalized: {} USDC ({} from pool, {} from reserve)",
        payout_amount,
        from_pool,
        from_reserve
    );
    Ok(())
}
