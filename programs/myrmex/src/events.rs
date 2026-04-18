use anchor_lang::prelude::*;

#[event]
pub struct PolicyCreated {
    pub policy: Pubkey,
    pub policyholder: Pubkey,
    pub pool: Pubkey,
    pub coverage_type: u8,
    pub payout_amount: u64,
    pub premium_amount: u64,
    pub expires_at: i64,
}

#[event]
pub struct PayoutExecuted {
    pub policy: Pubkey,
    pub policyholder: Pubkey,
    pub payout_amount: u64,
    pub oracle_value: i64,
    pub timestamp: i64,
}

#[event]
pub struct PolicyExpired {
    pub policy: Pubkey,
    pub pool: Pubkey,
    pub premium_distributed: u64,
}

#[event]
pub struct PoolFunded {
    pub pool: Pubkey,
    pub provider: Pubkey,
    pub usdc_amount: u64,
    pub lp_tokens_minted: u64,
}

#[event]
pub struct LpWithdrawn {
    pub pool: Pubkey,
    pub provider: Pubkey,
    pub usdc_returned: u64,
    pub lp_tokens_burned: u64,
}
