use anchor_lang::prelude::*;

/// Pending oracle authority change. Created by `propose_oracle_authority`,
/// applied by `apply_oracle_authority` after ORACLE_TIMELOCK_SECS.
#[account]
pub struct OracleAuthorityProposal {
    pub pool: Pubkey,
    pub proposed_oracle: Pubkey,
    pub effective_at: i64,
    pub bump: u8,
}

impl OracleAuthorityProposal {
    // 8 discriminator + 32 + 32 + 8 + 1
    pub const LEN: usize = 81;
}

/// 72 hours — gives policyholders and LPs enough time to react to a
/// compromised authority key before a malicious oracle can take effect.
pub const ORACLE_TIMELOCK_SECS: i64 = 259_200;
