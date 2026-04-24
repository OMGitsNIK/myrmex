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

    pub fn initialize_pool_config(
        ctx: Context<InitializePoolConfig>,
        oracle_authority: Pubkey,
        min_premium_bps: u64,
        max_coverage_bps: u64,
    ) -> Result<()> {
        instructions::initialize_pool_config::handler(ctx, oracle_authority, min_premium_bps, max_coverage_bps)
    }

    pub fn post_oracle_report(
        ctx: Context<PostOracleReport>,
        reported_value: i64,
        scope_hash: [u8; 32],
        description: [u8; 192],
    ) -> Result<()> {
        instructions::post_oracle_report::handler(ctx, reported_value, scope_hash, description)
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

    pub fn trigger_payout(ctx: Context<TriggerPayout>) -> Result<()> {
        instructions::trigger_payout::handler(ctx)
    }

    pub fn expire_policy(ctx: Context<ExpirePolicy>) -> Result<()> {
        instructions::expire_policy::handler(ctx)
    }

    pub fn update_pool_config(
        ctx: Context<UpdatePoolConfig>,
        min_premium_bps: u64,
        max_coverage_bps: u64,
    ) -> Result<()> {
        instructions::update_pool_config::handler(ctx, min_premium_bps, max_coverage_bps)
    }

    pub fn propose_oracle_authority(
        ctx: Context<ProposeOracleAuthority>,
        new_oracle: Pubkey,
    ) -> Result<()> {
        instructions::propose_oracle_authority::handler(ctx, new_oracle)
    }

    pub fn apply_oracle_authority(ctx: Context<ApplyOracleAuthority>) -> Result<()> {
        instructions::apply_oracle_authority::handler(ctx)
    }

    pub fn stake_myr(ctx: Context<StakeMyr>, amount: u64) -> Result<()> {
        instructions::stake_myr::handler(ctx, amount)
    }

    pub fn unstake_myr(ctx: Context<UnstakeMyr>, amount: u64) -> Result<()> {
        instructions::unstake_myr::handler(ctx, amount)
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        proposal_id: u64,
        title: [u8; 64],
        description: [u8; 128],
        voting_duration_secs: i64,
    ) -> Result<()> {
        instructions::create_proposal::handler(ctx, proposal_id, title, description, voting_duration_secs)
    }

    pub fn cast_vote(ctx: Context<CastVote>, proposal_id: u64, vote: bool) -> Result<()> {
        instructions::cast_vote::handler(ctx, proposal_id, vote)
    }
}
