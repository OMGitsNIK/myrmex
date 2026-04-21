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
    #[msg("Oracle data is stale")]
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
    #[msg("Premium is below the pool's minimum floor")]
    InsufficientPremium,
    #[msg("Coverage cap exceeded: pool cannot accept more locked exposure")]
    CoverageCapExceeded,
    #[msg("Oracle report is stale — must be posted within the validity window")]
    OracleReportStale,
    #[msg("Oracle report was posted before this policy was created")]
    OracleReportBeforePolicy,
    #[msg("Oracle report scope does not match this policy")]
    OracleScopeMismatch,
    #[msg("Invalid configuration parameter")]
    InvalidConfig,
}
