use anchor_lang::prelude::*;
use crate::errors::MyrmexError;

#[account]
pub struct RiskPool {
    pub authority: Pubkey,
    pub pool_type: u8,
    pub pool_name: [u8; 32],
    pub usdc_mint: Pubkey,
    pub vault: Pubkey,
    pub lp_token_mint: Pubkey,
    pub total_liquidity: u64,
    pub total_locked: u64,
    pub premium_accrued: u64,
    pub active_policy_count: u64,
    pub is_active: bool,
    pub bump: u8,
}

impl RiskPool {
    // 8 + 32 + 1 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1 = 203
    pub const LEN: usize = 203;

    pub fn calculate_lp_tokens(&self, deposit: u64, lp_supply: u64) -> Result<u64> {
        if self.total_liquidity == 0 || lp_supply == 0 {
            return Ok(deposit);
        }
        let result = (deposit as u128)
            .checked_mul(lp_supply as u128)
            .ok_or(error!(MyrmexError::MathOverflow))?
            .checked_div(self.total_liquidity as u128)
            .ok_or(error!(MyrmexError::MathOverflow))?;
        Ok(result as u64)
    }

    pub fn calculate_usdc_withdrawal(&self, lp_amount: u64, lp_supply: u64) -> Result<u64> {
        let result = (lp_amount as u128)
            .checked_mul(self.total_liquidity as u128)
            .ok_or(error!(MyrmexError::MathOverflow))?
            .checked_div(lp_supply as u128)
            .ok_or(error!(MyrmexError::MathOverflow))?;
        Ok(result as u64)
    }

    pub fn available_liquidity(&self) -> u64 {
        self.total_liquidity.saturating_sub(self.total_locked)
    }
}
