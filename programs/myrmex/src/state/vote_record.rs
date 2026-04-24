use anchor_lang::prelude::*;

/// One account per (voter, proposal) pair — prevents double voting.
/// Created by `cast_vote`; its existence proves the voter already voted.
#[account]
pub struct VoteRecord {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub vote: bool,
    pub bump: u8,
}

impl VoteRecord {
    // 8 disc + 32 + 32 + 1 + 1
    pub const LEN: usize = 74;
}
