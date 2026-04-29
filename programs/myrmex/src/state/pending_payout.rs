use anchor_lang::prelude::*;

#[account]
pub struct PendingPayout {
    pub policy: Pubkey,
    pub pool: Pubkey,
    pub policyholder: Pubkey,
    pub amount: u64,
    pub execute_after: i64,
    pub vetoed: bool,
    pub bump: u8,
}

impl PendingPayout {
    // 8 disc + 32 + 32 + 32 + 8 + 8 + 1 + 1
    pub const LEN: usize = 122;
}
