use anchor_lang::prelude::*;

#[account]
pub struct GovernanceProposal {
    pub id: u64,
    pub proposer: Pubkey,
    pub description: [u8; 128],
    pub votes_for: u64,
    pub votes_against: u64,
    pub created_at: i64,
    pub voting_ends_at: i64,
    pub executed: bool,
    pub bump: u8,
}

impl GovernanceProposal {
    pub const LEN: usize = 8 + 8 + 32 + 128 + 8 + 8 + 8 + 8 + 1 + 1; // 210
}
