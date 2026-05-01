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
        instructions::initialize_pool_config::handler(
            ctx,
            oracle_authority,
            min_premium_bps,
            max_coverage_bps,
        )
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
        demo_mode: bool,
    ) -> Result<()> {
        instructions::update_pool_config::handler(ctx, min_premium_bps, max_coverage_bps, demo_mode)
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
        action_type: u8,
        action_payload: [u8; 64],
    ) -> Result<()> {
        instructions::create_proposal::handler(
            ctx,
            proposal_id,
            title,
            description,
            voting_duration_secs,
            action_type,
            action_payload,
        )
    }

    pub fn cast_vote(ctx: Context<CastVote>, proposal_id: u64, vote: bool) -> Result<()> {
        instructions::cast_vote::handler(ctx, proposal_id, vote)
    }

    pub fn close_policy(ctx: Context<ClosePolicy>, nonce: i64) -> Result<()> {
        instructions::close_policy::handler(ctx, nonce)
    }

    pub fn execute_proposal(ctx: Context<ExecuteProposal>, proposal_id: u64) -> Result<()> {
        instructions::execute_proposal::handler(ctx, proposal_id)
    }

    // ── Feature 1: Governance 48-hour timelock ────────────────────────────
    pub fn queue_proposal(ctx: Context<QueueProposal>, proposal_id: u64) -> Result<()> {
        instructions::queue_proposal::handler(ctx, proposal_id)
    }

    // ── Feature 2: Payout delay ───────────────────────────────────────────
    pub fn queue_payout(ctx: Context<QueuePayout>) -> Result<()> {
        instructions::queue_payout::handler(ctx)
    }

    pub fn finalize_payout(ctx: Context<FinalizePayout>) -> Result<()> {
        instructions::finalize_payout::handler(ctx)
    }

    pub fn veto_payout(ctx: Context<VetoPayout>) -> Result<()> {
        instructions::veto_payout::handler(ctx)
    }

    // ── Emergency pool management ─────────────────────────────────────────
    pub fn toggle_pool_active(ctx: Context<TogglePoolActive>, active: bool) -> Result<()> {
        instructions::toggle_pool_active::handler(ctx, active)
    }

    pub fn set_tranche_split(
        ctx: Context<SetTrancheSplit>,
        junior_bps: u64,
        mezzanine_bps: u64,
        senior_bps: u64,
    ) -> Result<()> {
        instructions::set_tranche_split::handler(ctx, junior_bps, mezzanine_bps, senior_bps)
    }

    // ── Feature 3: Reserve fund ───────────────────────────────────────────
    pub fn initialize_reserve(ctx: Context<InitializeReserve>) -> Result<()> {
        instructions::initialize_reserve::handler(ctx)
    }

    // ── Feature 4: Oracle multi-sig ───────────────────────────────────────
    pub fn initialize_oracle_multisig(
        ctx: Context<InitializeOracleMultisig>,
        signers: [Pubkey; 3],
        threshold: u8,
    ) -> Result<()> {
        instructions::initialize_oracle_multisig::handler(ctx, signers, threshold)
    }

    // ── Feature 5: Tranched liquidity ─────────────────────────────────────
    pub fn fund_tranche(ctx: Context<FundTranche>, amount: u64, tranche: u8) -> Result<()> {
        instructions::fund_tranche::handler(ctx, amount, tranche)
    }

    pub fn withdraw_tranche(
        ctx: Context<WithdrawTranche>,
        lp_amount: u64,
        tranche: u8,
    ) -> Result<()> {
        instructions::withdraw_tranche::handler(ctx, lp_amount, tranche)
    }
}
