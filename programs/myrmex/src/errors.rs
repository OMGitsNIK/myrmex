use anchor_lang::prelude::*;

#[error_code]
pub enum MyrmexError {
    #[msg("Policy has expired")]
    PolicyExpired,
    #[msg("Policy is not active")]
    PolicyNotActive,
    #[msg("Policy has already been claimed")]
    PolicyAlreadyClaimed,
    #[msg("Insufficient pool liquidity for this policy")]
    InsufficientLiquidity,
    #[msg("Trigger condition not met")]
    TriggerNotMet,
    #[msg("Oracle data is stale (>60 seconds old)")]
    StaleOracleData,
    #[msg("Oracle confidence interval too wide")]
    OracleConfidenceTooWide,
    #[msg("Wrong oracle provided for this policy")]
    WrongOracle,
    #[msg("Policy has not yet expired")]
    PolicyNotExpired,
    #[msg("Math overflow in calculation")]
    MathOverflow,
    #[msg("Pool is not active")]
    PoolNotActive,
    #[msg("Withdrawal exceeds available liquidity")]
    WithdrawalExceedsAvailable,
    #[msg("Unauthorized")]
    Unauthorized,
}
