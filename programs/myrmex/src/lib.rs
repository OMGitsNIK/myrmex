#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod oracle;
pub mod state;

use instructions::*;
use state::TriggerCondition;

declare_id!("9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan");

#[program]
pub mod myrmex {
    use super::*;

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        pool_type: u8,
        pool_name: [u8; 32],
    ) -> Result<()> {
        instructions::initialize_pool::handler(ctx, pool_type, pool_name)
    }

    pub fn fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
        instructions::fund_pool::handler(ctx, amount)
    }

    pub fn withdraw_lp(ctx: Context<WithdrawLp>, lp_amount: u64) -> Result<()> {
        instructions::withdraw_lp::handler(ctx, lp_amount)
    }

    pub fn create_policy(
        ctx: Context<CreatePolicy>,
        coverage_type: u8,
        payout_amount: u64,
        premium_amount: u64,
        trigger_condition: TriggerCondition,
        expires_at: i64,
        nonce: i64,
    ) -> Result<()> {
        instructions::create_policy::handler(
            ctx,
            coverage_type,
            payout_amount,
            premium_amount,
            trigger_condition,
            expires_at,
            nonce,
        )
    }

    pub fn trigger_payout(ctx: Context<TriggerPayout>, oracle_value: i64) -> Result<()> {
        instructions::trigger_payout::handler(ctx, oracle_value)
    }

    pub fn expire_policy(ctx: Context<ExpirePolicy>) -> Result<()> {
        instructions::expire_policy::handler(ctx)
    }

    pub fn stake_myr(ctx: Context<StakeMyr>, amount: u64) -> Result<()> {
        instructions::stake_myr::handler(ctx, amount)
    }

    pub fn cast_vote(ctx: Context<CastVote>, proposal_id: u64, vote: bool) -> Result<()> {
        instructions::cast_vote::handler(ctx, proposal_id, vote)
    }
}
