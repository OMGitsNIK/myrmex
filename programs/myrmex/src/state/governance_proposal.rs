use anchor_lang::prelude::*;

#[account]
pub struct GovernanceProposal {
    pub id: u64,
    pub proposer: Pubkey,
    pub title: [u8; 64],
    pub description: [u8; 128],
    pub votes_for: u64,
    pub votes_against: u64,
    pub created_at: i64,
    pub voting_ends_at: i64,
    pub executed: bool,
    pub bump: u8,
}

impl GovernanceProposal {
    // 8 disc + 8 + 32 + 64 + 128 + 8 + 8 + 8 + 8 + 1 + 1
    pub const LEN: usize = 274;
}
