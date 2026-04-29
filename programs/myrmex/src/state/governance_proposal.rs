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
    // action_type: 0 = OracleAuthorityChange, 1 = PoolConfigChange
    pub action_type: u8,
    // For type 0: [new_oracle: 32 bytes, padding: 32 bytes]
    // For type 1: [pool: 32 bytes, min_premium_bps: 8 bytes, max_coverage_bps: 8 bytes, padding: 16 bytes]
    pub action_payload: [u8; 64],
}

impl GovernanceProposal {
    // 8 disc + 8 + 32 + 64 + 128 + 8 + 8 + 8 + 8 + 1 + 1 + 1 + 64
    pub const LEN: usize = 339;
}
