use anchor_lang::prelude::*;

#[account]
pub struct OracleReport {
    /// Must match pool_config.oracle_authority — only this keypair can post reports
    pub authority: Pubkey,
    /// Which pool this report is for
    pub pool: Pubkey,
    /// The verified oracle value (e.g. rainfall mm, delay minutes, TVL in USD)
    pub reported_value: i64,
    /// Unix timestamp when this report was posted
    pub reported_at: i64,
    /// Human-readable description of the verified event (for audit trail)
    pub description: [u8; 192],
    pub bump: u8,
}

impl OracleReport {
    // 8 discriminator + 32 + 32 + 8 + 8 + 192 + 1
    pub const LEN: usize = 281;

    /// Reports are valid for 24 hours — enough time for policyholders to claim
    pub const MAX_AGE_SECS: i64 = 86_400;
}
