use anchor_lang::prelude::*;

#[account]
pub struct OracleMultisigConfig {
    pub pool: Pubkey,
    /// Up to 3 authorized oracle signers
    pub signers: [Pubkey; 3],
    /// Minimum number of signers required to post a report (1–3)
    pub threshold: u8,
    pub bump: u8,
}

impl OracleMultisigConfig {
    // 8 disc + 32 (pool) + 96 (3 × 32) + 1 (threshold) + 1 (bump)
    pub const LEN: usize = 138;
}
