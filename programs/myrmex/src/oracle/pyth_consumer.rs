use crate::errors::MyrmexError;
use anchor_lang::prelude::*;

const MAX_ORACLE_AGE_SECS: i64 = 60;

/// Verify trigger condition: 0=greater_than, 1=less_than, 2=equal_to
pub fn verify_trigger(oracle_value: i64, threshold: i64, comparison: u8) -> Result<()> {
    let triggered = match comparison {
        0 => oracle_value > threshold,
        1 => oracle_value < threshold,
        2 => oracle_value == threshold,
        _ => return err!(MyrmexError::TriggerNotMet),
    };
    require!(triggered, MyrmexError::TriggerNotMet);
    Ok(())
}

/// For mock oracle accounts: verify data is fresh (published within 60s)
pub fn check_mock_oracle_freshness(published_at: i64, clock: &Clock) -> Result<()> {
    require!(
        clock.unix_timestamp.saturating_sub(published_at) <= MAX_ORACLE_AGE_SECS,
        MyrmexError::StaleOracleData
    );
    Ok(())
}
