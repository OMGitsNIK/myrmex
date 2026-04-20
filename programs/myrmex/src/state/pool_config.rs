use anchor_lang::prelude::*;

#[account]
pub struct PoolConfig {
    pub pool: Pubkey,
    pub oracle_authority: Pubkey,
    /// Minimum premium in basis points of payout amount (e.g. 500 = 5%)
    pub min_premium_bps: u64,
    /// Maximum coverage ratio in basis points of total_liquidity (e.g. 8000 = 80%)
    pub max_coverage_bps: u64,
    pub bump: u8,
}

impl PoolConfig {
    // 8 discriminator + 32 + 32 + 8 + 8 + 1
    pub const LEN: usize = 89;
}
