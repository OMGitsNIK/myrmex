use anchor_lang::prelude::*;

/// Legacy enum — not used at runtime (pool_type is stored as u8, indices 0–5).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum CoverageType {
    Earthquake,      // 0 — Earthquake-Pacific
    Flood,           // 1 — Flood-US-Rivers
    CropMultiPeril,  // 2 — Crop-MultiF (drought + flood + freeze)
    Hurricane,       // 3 — Hurricane-Gulf
    StablecoinDepeg, // 4 — USDC-Depeg
    BridgeHack,      // 5 — Bridge-Hack
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TriggerCondition {
    pub oracle_pubkey: Pubkey,
    /// Domain-specific risk scope, such as region/gauge/asset/route hash.
    /// Payouts require an oracle report posted for the same scope.
    pub scope_hash: [u8; 32],
    pub threshold: i64,
    pub comparison: u8,
}

#[account]
pub struct PolicyVault {
    pub policyholder: Pubkey,
    pub pool: Pubkey,
    pub coverage_type: u8,
    pub payout_amount: u64,
    pub premium_amount: u64,
    pub trigger_condition: TriggerCondition,
    pub expires_at: i64,
    pub created_at: i64,
    pub is_active: bool,
    pub is_claimed: bool,
    pub bump: u8,
}

impl PolicyVault {
    // 8 discriminator + 32 + 32 + 1 + 8 + 8 + (32+32+8+1) + 8 + 8 + 1 + 1 + 1 = 181
    pub const LEN: usize = 181;
}
