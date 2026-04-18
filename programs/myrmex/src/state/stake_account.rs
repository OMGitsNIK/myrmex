use anchor_lang::prelude::*;

#[account]
pub struct StakeAccount {
    pub owner: Pubkey,
    pub amount_staked: u64,
    pub staked_at: i64,
    pub lock_until: i64,
    pub bump: u8,
}

impl StakeAccount {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 1; // 65
}
