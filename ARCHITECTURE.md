# MYRMEX Architecture

## On-chain State

### RiskPool (`state/risk_pool.rs`)

```
Discriminator:       8 bytes
authority:           32 bytes  (pool admin pubkey)
pool_type:           1 byte    (0=earthquake, 1=flood, 2=crop_multifactor, 3=hurricane, 4=stablecoin_depeg, 5=bridge_hack)
name:                32 bytes
vault:               32 bytes  (ATA holding USDC, owned by pool PDA)
lp_token_mint:       32 bytes  (LP token mint PDA)
total_liquidity:     8 bytes   (u64, USDC lamports)
total_locked:        8 bytes   (u64, USDC locked as collateral)
premium_accrued:     8 bytes   (u64, USDC collected in premiums)
active_policy_count: 4 bytes   (u32)
bump:                1 byte
is_active:           1 byte
TOTAL:               167 bytes + 8 discriminator = 175 bytes (padded to 203)
```

### PolicyVault (`state/policy_vault.rs`)

```
Discriminator:       8 bytes
policyholder:        32 bytes
pool:                32 bytes
coverage_type:       1 byte
payout_amount:       8 bytes   (u64, USDC lamports)
premium_amount:      8 bytes   (u64, USDC lamports)
trigger_condition:   73 bytes  (oracle_pubkey[32] + scope_hash[32] + threshold[8] + comparison[1])
created_at:          8 bytes   (i64, unix timestamp)
expires_at:          8 bytes   (i64, unix timestamp)
is_active:           1 byte
is_claimed:          1 byte    ← CEI guard
bump:                1 byte
TOTAL:               ~181 bytes + 8 discriminator = 189 bytes (padded)
```

## Instruction Flow

### `initialize_pool`
1. Create `RiskPool` PDA with seeds `[b"pool", authority, pool_type]`
2. Create LP token mint PDA with seeds `[b"lp_mint", pool_pda]`
3. Create vault ATA owned by pool PDA (init-if-needed)
4. Set `is_active = true`, zero all counters

### `fund_pool`
1. Transfer USDC from provider → pool vault (SPL token transfer)
2. Calculate LP tokens to mint: `deposit * lp_supply / total_liquidity` (pro-rata)
3. Pool PDA signs the LP mint CPI: seeds `[b"pool", authority_key, &[pool_type], &[bump]]`
4. Update `total_liquidity += deposit`

### `create_policy`
1. Verify pool is active and policy not expired at creation time
2. Transfer premium from policyholder → pool vault
3. Update `premium_accrued += premium`, `total_locked += payout_amount`, `active_policy_count += 1`
4. Initialize `PolicyVault` PDA with seeds `[b"policy", policyholder, pool, nonce_le_bytes]`
   - `nonce` is a caller-supplied `i64` (typically unix timestamp) for uniqueness

### `trigger_payout`
1. Verify policy is active and not already claimed
2. Verify caller matches `policy.trigger_condition.oracle_pubkey`
3. Evaluate oracle value against condition (GT/LT/EQ comparisons)
4. **CEI**: Set `is_claimed = true`, `is_active = false` BEFORE any transfer
5. CPI transfer `payout_amount` USDC from pool vault → policyholder's ATA
6. Update pool: `total_locked -= payout_amount`, `active_policy_count -= 1`

### `expire_policy`
1. Verify policy is active and `Clock::now > expires_at`
2. Set `is_active = false`
3. Update pool: `total_locked -= payout_amount`, `active_policy_count -= 1`
4. Does NOT refund premium (premiums are earned by LPs for risk taken)

### `withdraw_lp`
1. Calculate USDC withdrawal amount: `lp_amount * total_liquidity / lp_supply`
2. Verify `total_liquidity - withdrawal >= total_locked` (collateral stays locked)
3. Burn LP tokens from provider's account (pool PDA signs)
4. Transfer USDC from vault → provider

## Pricing Engine (Python FastAPI)

Six actuarial models in `pricing/main.py`, one per coverage type:

| Type | Model | Key inputs |
|------|-------|-----------|
| Earthquake | Gutenberg-Richter magnitude-frequency | magnitude threshold, seismic region |
| Flood | Stage-frequency curve | gauge height threshold, river system |
| Crop Multi-Factor | Composite stress score CDF | score threshold, crop region |
| Hurricane | Saffir-Simpson wind-frequency | wind knot threshold |
| Stablecoin Depeg | Historical depeg event frequency | depeg threshold in bps |
| Bridge / Exchange Hack | TVL drop velocity model | TVL floor in $M |

Premium formula: `max(min_rate × payout, E[loss] × vol_loading × util_loading)`.  
Response includes full actuarial breakdown: `annual_prob`, `period_prob`, `expected_loss`, `vol_loading`, `util_loading`.

## Off-chain Indexer (Node.js Express)

- **`indexer.service.ts`**: Subscribes to program logs via WebSocket, tracks `PolicyCreated` / `PayoutTriggered` / `PolicyExpired` events in SQLite
- **`cron.service.ts`**: Runs every 5 minutes via `node-cron`; calls `expire_policy` for any policy past `expires_at`, and posts oracle reports for all 6 pools
- Routes proxy on-chain account fetches through Anchor's `program.account.*` namespace

## Security Design

| Threat | Mitigation |
|--------|-----------|
| Double-payout | `is_claimed = true` before CPI (CEI pattern) |
| Integer overflow | `checked_*` arithmetic throughout; `MathOverflow` error |
| Wrong oracle | `require!(oracle.key() == policy.trigger_condition.oracle_pubkey)` |
| LP draining | `require!(available >= total_locked)` in withdraw_lp |
| Fake pool PDA | Anchor `seeds` constraint validates PDA derivation |
| Stale oracle | `MAX_AGE_SECS = 86400` (24h) in `OracleReport`; `trigger_payout` rejects stale reports |
| Post-event purchase | `oracle_report.reported_at >= policy.created_at` enforced in `trigger_payout` |
| Cross-scope oracle | `scope_hash` in `TriggerCondition` and `OracleReport` must match; PDA seeds include hash |
| Re-entrancy | CEI pattern; Solana's single-threaded execution model |
