use crate::errors::MyrmexError;
use crate::state::{GovernanceProposal, PoolConfig, RiskPool};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(proposal_id: u64)]
pub struct ExecuteProposal<'info> {
    #[account(mut)]
    pub executor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"proposal", &proposal_id.to_le_bytes()],
        bump = proposal.bump,
        constraint = !proposal.executed @ MyrmexError::Unauthorized,
    )]
    pub proposal: Account<'info, GovernanceProposal>,

    /// Pool whose config is being updated. Decoded from action_payload.
    pub pool: Account<'info, RiskPool>,

    #[account(
        mut,
        seeds = [b"pool_config", pool.key().as_ref()],
        bump = pool_config.bump,
        constraint = pool_config.pool == pool.key() @ MyrmexError::Unauthorized,
    )]
    pub pool_config: Account<'info, PoolConfig>,
}

pub fn handler(ctx: Context<ExecuteProposal>, _proposal_id: u64) -> Result<()> {
    let clock = Clock::get()?;
    let proposal = &ctx.accounts.proposal;

    // Voting must have ended
    require!(
        clock.unix_timestamp >= proposal.voting_ends_at,
        MyrmexError::ProposalNotPassed
    );
    // Must have majority
    require!(
        proposal.votes_for > proposal.votes_against,
        MyrmexError::ProposalNotPassed
    );

    let payload = proposal.action_payload;
    let action_type = proposal.action_type;

    match action_type {
        0 => {
            // OracleAuthorityChange: first 32 bytes = new oracle pubkey
            let new_oracle = Pubkey::try_from(&payload[..32])
                .map_err(|_| error!(MyrmexError::InvalidActionType))?;
            ctx.accounts.pool_config.oracle_authority = new_oracle;
            msg!("Proposal executed: oracle authority → {}", new_oracle);
        }
        1 => {
            // PoolConfigChange: first 32 bytes = pool key (validated via constraint),
            // next 8 bytes = min_premium_bps, next 8 bytes = max_coverage_bps
            let min_bps = u64::from_le_bytes(
                payload[32..40]
                    .try_into()
                    .map_err(|_| error!(MyrmexError::InvalidActionType))?,
            );
            let max_bps = u64::from_le_bytes(
                payload[40..48]
                    .try_into()
                    .map_err(|_| error!(MyrmexError::InvalidActionType))?,
            );
            require!((50..=10_000).contains(&min_bps), MyrmexError::InvalidConfig);
            require!(max_bps > 0 && max_bps <= 10_000, MyrmexError::InvalidConfig);
            ctx.accounts.pool_config.min_premium_bps = min_bps;
            ctx.accounts.pool_config.max_coverage_bps = max_bps;
            msg!(
                "Proposal executed: pool config min_premium_bps={} max_coverage_bps={}",
                min_bps,
                max_bps
            );
        }
        _ => return err!(MyrmexError::InvalidActionType),
    }

    ctx.accounts.proposal.executed = true;
    Ok(())
}
