#  MYRMEX — Decentralized Parametric Insurance on Solana

> Insurance that pays itself. No adjusters. No claims process. When an oracle confirms a real-world trigger event, USDC moves to the policyholder automatically — in the same block.

**Program (devnet):** `9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan`  
**Explorer:** [View on Solana Explorer](https://explorer.solana.com/address/9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan?cluster=devnet)  
**Frontend:** https://myrmex-iota.vercel.app  
**Demo Video:** *[3-minute walkthrough — link TBD]*

---

## The Problem

Traditional insurance has a claims process. You file a claim, an adjuster investigates, weeks or months pass, paperwork accumulates, and you might get paid. This is slow, expensive, opaque, and adversarial — the insurer profits by denying claims.

**Parametric insurance** removes all of that. Instead of subjective assessment ("did your crop fail?"), the policy defines an objective condition: "if rainfall drops below 20mm this month, pay out $500 USDC." When an oracle posts that number on-chain, the smart contract checks it, and money moves. No adjuster. No dispute. No waiting.

MYRMEX brings this to Solana — where settlement is 400ms and transactions cost fractions of a cent.

---

## How It Works

Three groups of participants interact with MYRMEX:

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  LIQUIDITY PROVIDERS          POLICYHOLDERS          ORACLES     │
│  Deposit USDC → earn          Pay a premium →        Post real-  │
│  premiums as yield            get covered            world data  │
│         │                          │                     │       │
│         └──────────────────────────┴─────────────────────┘       │
│                                    │                             │
│                         ┌──────────▼───────────┐                 │
│                         │   MYRMEX PROGRAM     │                 │
│                         │   (Solana / Anchor)  │                 │
│                         │                      │                 │
│                         │  oracle value meets  │                 │
│                         │  threshold? → pay    │                 │
│                         └──────────────────────┘                 │
└──────────────────────────────────────────────────────────────────┘
```

**Liquidity Providers** deposit USDC into risk pools. They receive LP tokens representing their share. When policyholders pay premiums, that yield accrues to LPs. They take the risk of payouts; they earn the reward of premiums.

**Policyholders** pay a premium to buy coverage. The policy defines a payout amount and a trigger condition (an oracle pubkey + a threshold value + a comparison operator). If the condition is met before expiry, they receive an instant USDC transfer.

**Oracles** are any keypair that signs a `trigger_payout` transaction. The contract verifies the signer matches the oracle pubkey stored in the policy. Because Solana transaction signing proves key ownership, this is trustless — if the oracle's key signs it, the oracle posted that value.

---

## Smart Contract Deep Dive (`programs/myrmex/`)

Built with Rust and Anchor 0.32.1. The program has two core account types and eight instructions.

### Account: `RiskPool`

A pool of USDC backing one category of coverage. Liquidity providers deposit into pools; policyholders buy from them.

```
authority       → who created the pool (admin pubkey)
pool_type       → u8: 0=earthquake, 1=flood, 2=crop_multifactor, 3=hurricane, 4=stablecoin_depeg, 5=bridge_hack
vault           → ATA holding all USDC (owned by pool PDA — only program can sign)
lp_token_mint   → mint for LP tokens (also a PDA — only program can mint)
total_liquidity → total USDC deposited by LPs
total_locked    → USDC currently locked as collateral for active policies
premium_accrued → total premiums collected
active_policy_count
```

**PDA derivation:** `["pool", authority_pubkey, pool_type_byte]`  
Because `authority` is part of the seeds, different admins can create pools of the same type — and a single admin can create multiple pool types.

### Account: `PolicyVault`

One per policy. Stores everything needed to evaluate and pay a claim.

```
policyholder    → who bought the policy
pool            → which risk pool backs this policy
coverage_type   → u8 matching the pool type
payout_amount   → USDC lamports to transfer on trigger
premium_amount  → USDC lamports paid upfront
trigger_condition:
  oracle_pubkey → the key that must sign trigger_payout
  scope_hash    → sha256 of scope seed (e.g. "earthquake:Global") — binds report to risk domain
  threshold     → i64 value to compare against
  comparison    → 0=GreaterThan, 1=LessThan, 2=Equal
expires_at      → unix timestamp — policy void after this
is_active       → false once claimed or expired
is_claimed      → double-payout guard (set BEFORE transfer — CEI pattern)
```

**PDA derivation:** `["policy", policyholder_pubkey, pool_pda, nonce_le_bytes]`  
The `nonce` (typically unix timestamp) lets a single wallet hold multiple policies against the same pool.

### Instructions

**`initialize_pool`** — Admin creates a new RiskPool PDA, an LP token mint PDA (seeds: `["lp_mint", pool_pda]`), and a USDC vault ATA owned by the pool PDA. Sets `is_active = true`.

**`fund_pool`** — LP transfers USDC to the vault. LP tokens are minted proportional to their share of total liquidity:
```
lp_tokens_to_mint = deposit × lp_supply / total_liquidity
```
If the pool is empty (first deposit), they receive 1:1. The pool PDA signs the LP mint CPI using its seeds as the signing authority.

**`create_policy`** — Policyholder pays a premium (transferred to vault), the payout amount is added to `total_locked`, and a PolicyVault PDA is initialized storing the trigger condition.

**`trigger_payout`** — The critical instruction. Enforces the Checks-Effects-Interactions pattern:
```rust
// 1. CHECKS: verify policy active, not claimed, oracle matches, condition met
require!(!policy.is_claimed, PolicyAlreadyClaimed);
require!(oracle.key() == policy.trigger_condition.oracle_pubkey, WrongOracle);
verify_trigger(oracle_value, condition)?;

// 2. EFFECTS: mutate state BEFORE any external call
policy.is_claimed = true;   // ← set first, prevents reentrancy
policy.is_active  = false;
pool.total_locked -= payout_amount;

// 3. INTERACTIONS: now safe to transfer
token::transfer(CpiContext::new_with_signer(...), payout_amount)?;
```
This ordering means even if the CPI somehow re-entered the program, `is_claimed` is already `true` and the second call would revert.

**`expire_policy`** — Anyone can call this once `clock.unix_timestamp > policy.expires_at`. Sets `is_active = false` and frees the locked collateral back to LPs. Premiums are NOT refunded — LPs earned them for taking the risk.

**`withdraw_lp`** — LP burns tokens, receives proportional USDC. Protected by:
```rust
require!(
    total_liquidity - withdrawal_amount >= pool.total_locked,
    WithdrawalExceedsAvailable
);
```
LPs cannot drain collateral that belongs to active policyholders.

### Security

| Threat | Mitigation |
|--------|-----------|
| Double-payout / reentrancy | `is_claimed = true` before CPI (CEI pattern) |
| Integer overflow | All u64/u128 ops: `checked_add`, `checked_mul`, `checked_sub`, `checked_div` only |
| Wrong oracle posts value | `require!(oracle.key() == policy.trigger_condition.oracle_pubkey)` |
| LP drains locked collateral | `require!(available_liquidity >= total_locked)` |
| Fake PDA injection | Anchor `seeds` + `bump` constraints validate derivation on every call |

---

## Pricing Engine (`pricing/`)

A Python FastAPI service that runs actuarial models to price premiums. Judges a fair premium by modeling historical probability of the trigger firing.

**`POST /quote`** routes to one of six actuarial models:

| Coverage type | Key risk driver | Oracle source |
|---------------|----------------|---------------|
| `earthquake` | Gutenberg-Richter magnitude-frequency | USGS Earthquake API |
| `flood` | Stage-frequency curve for river gauge | USGS Water Services |
| `crop_multifactor` | Composite stress score CDF | Open-Meteo dual-source |
| `hurricane` | Saffir-Simpson wind-frequency | NOAA NHC + Weather.gov |
| `stablecoin_depeg` | Historical depeg event frequency | CoinGecko dual-endpoint |
| `bridge_hack` | TVL drop velocity vs $1.73B baseline | DeFiLlama TVL + hacks |

Premium formula: `max(min_floor, E[loss] × vol_loading × util_loading)`.  
Floor is 500 bps (5%) of payout — enforced both by the pricing engine and on-chain `pool_config.min_premium_bps`.

Each model returns:
```json
{
  "premium_usdc": 53.19,
  "premium_pct": 5.319,
  "risk_score": 4.11,
  "confidence": "high",
  "breakdown": {
    "annual_probability": 0.4,
    "period_probability": 0.041,
    "expected_loss_usdc": 41.12,
    "vol_loading": 1.15,
    "util_loading": 1.125
  }
}
```

```bash
# Test it
curl -X POST https://myrmex-pricing-production.up.railway.app/quote \
  -H "Content-Type: application/json" \
  -d '{"coverage_type":"earthquake","payout_amount_usdc":1000,"duration_days":30,"min_magnitude":6.5,"seismic_region":"Global"}'
```

---

## REST API (`api/`)

A Node.js Express server that bridges the frontend to the Solana program. Three responsibilities:

**1. Read chain state**  
Uses Anchor's `program.account.riskPool.all()` and `program.account.policyVault.all()` to fetch live on-chain data and serve it as JSON. The frontend doesn't need to run an Anchor client — it just hits the API.

**2. Proxy quotes**  
`POST /api/quote` forwards to the pricing API and returns the result. Keeps the pricing service URL server-side.

**3. Simulate triggers (demo)**  
`POST /api/simulate-trigger` takes a policy pubkey, fetches it, and sends a signed `trigger_payout` instruction using the server keypair. This is what the demo page uses — it lets you experience the full flow without needing a real oracle integration.

**Cron job:** Runs every 5 minutes. Posts oracle reports for all 6 pools with correct `scope_hash` bindings, and calls `expire_policy` for any policy past `expires_at`. Oracle reports have a 24-hour freshness window enforced on-chain.

```
GET  /api/pools                          all risk pools from chain
GET  /api/policies?policyholder=<pubkey> policies for a wallet
GET  /api/stats                          TVL, active policies, pool count
POST /api/quote                          proxy to pricing API
POST /api/simulate-trigger               trigger a payout (demo)
GET  /health                             liveness check
```

---

## Frontend (`app/`)

Next.js 14 App Router with TypeScript. Connects to Phantom wallet via `@solana/wallet-adapter`. All wallet code is dynamically imported with `ssr: false` — wallet adapters use browser APIs that break during server-side rendering.

**Pages:**

`/buy` — Choose from 6 coverage types (earthquake, flood, crop multi-factor, hurricane, stablecoin depeg, bridge hack). Set payout amount, duration, and trigger threshold using preset buttons or custom values. Live actuarial quote updates as you type with full breakdown. Click Buy → sign one transaction → policy created on-chain.

`/pool` — See all active risk pools fetched from chain. Enter a USDC amount and click Deposit → sign one transaction → receive LP tokens.

`/portfolio` — All policies owned by your connected wallet, with status (active / claimed / expired).

`/simulate` — Demo page that walks through the complete flow step-by-step with an animated timeline: pool creation → LP funding → policy purchase → oracle trigger → payout verification. Calls the REST API's simulate endpoint. Designed to be recorded as a demo video.

---

## Running Locally

### Prerequisites
- Rust + [Anchor 0.32.1](https://www.anchor-lang.com/docs/installation)
- Solana CLI 2.x (`solana --version`)
- Node.js 18+ and Yarn
- Python 3.11+

### 1. Build & test the smart contract
```bash
# From repo root
anchor build
anchor test   # spins up local validator automatically — all 8 tests should pass
```

### 2. Start the pricing API
```bash
cd pricing
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Start the REST API
```bash
cd api
npm install
# Create api/.env:
#   RPC_URL=https://api.devnet.solana.com
#   PROGRAM_ID=9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan
#   PRICING_API_URL=http://localhost:8000
#   PORT=3001
npm run dev
```

### 4. Start the frontend
```bash
cd app
npm install
# .env.local is already configured for devnet
npm run dev   # → http://localhost:3000
```

### 5. Run the end-to-end test (localnet)
```bash
# Requires local validator running (anchor test starts one, or: solana-test-validator)
npx ts-node tests/e2e/full-flow.ts
# Expected: ✅ SUCCESS — Full flow completed in ~Xms
```

---

## Test Coverage

| # | Test | What it proves |
|---|------|----------------|
| 1 | Initialize risk pool | PDA derivation correct, vault created |
| 2 | LP funds pool, receives LP tokens | Pro-rata mint math, pool PDA signing |
| 3 | User creates earthquake policy | Premium transfer, collateral lock, scope_hash binding |
| 4 | Oracle triggers payout | Condition check, CEI transfer |
| 5 | Double-payout rejected | `is_claimed` guard works |
| 6 | Expire policy frees collateral | Cron automation path |
| 7 | LP withdrawal blocked (collateral locked) | Solvency invariant |
| 8 | LP withdrawal succeeds after expiry | Full LP exit path |

```bash
anchor test
# 8 passing (9s)
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14 / Vercel)               │
│                                                                 │
│  /buy          /pool         /portfolio      /simulate          │
│  Buy Policy    LP Deposit    My Policies     Demo Flow          │
└──────┬──────────────┬────────────────────────────┬──────────────┘
       │ wallet tx    │ REST calls                 │ REST calls
       │              ▼                            ▼
       │  ┌───────────────────┐      ┌────────────────────────┐
       │  │   REST API        │      │   Pricing API          │
       │  │   Node/Express    │      │   Python FastAPI       │
       │  │   port 3001       │      │   port 8000            │
       │  │                   │      │                        │
       │  │  Anchor client    │      │  6 actuarial models    │
       │  │  SQLite indexer   │      │  (EQ/Flood/Crop/       │
       │  │  5min cron+oracle │      │   Hurricane/Depeg/Hack)│
       │  └────────┬──────────┘      └────────────────────────┘
       │           │ Anchor RPC
       ▼           ▼
┌──────────────────────────────────────────────────────────────────┐
│                  SOLANA PROGRAM (Anchor 0.32.1)                  │
│                       devnet / localnet                          │
│                                                                  │
│   RiskPool PDA                    PolicyVault PDA                │
│   seeds: [pool, auth, type]       seeds: [policy, ph, pool, n]   │
│   ┌────────────────────┐          ┌───────────────────────┐      │
│   │ total_liquidity    │          │ payout_amount         │      │
│   │ total_locked       │◄─lock────│ trigger_condition     │      │
│   │ premium_accrued    │          │ oracle_pubkey         │      │
│   │ vault (ATA) ←USDC  │─────────►│ is_claimed ← CEI      │      │
│   │ lp_token_mint      │          │ expires_at            │      │
│   └────────────────────┘          └───────────────────────┘      │
│                                                                  │
│   initialize_pool  fund_pool  create_policy  trigger_payout      │
│   expire_policy    withdraw_lp  stake_myr  cast_vote             │
└──────────────────────────────────────────────────────────────────┘
```

---

## Known Limitations

1. **Oracle authority**: Oracle reports are posted by a permissioned keypair (`oracle_authority` in `pool_config`). Production would integrate Switchboard or Pyth for trustless, manipulation-resistant feeds.
2. **Pool config is immutable**: No update path for `oracle_authority`, `min_premium_bps`, or `max_coverage_bps` once set. A governance-gated `update_pool_config` instruction is planned for v2.1.
3. **Governance proposals are off-chain**: MYR staking and `cast_vote` instructions exist on-chain, but proposal creation and indexing are not yet fully on-chain.
4. **No mainnet**: Devnet only. Do not deploy with real funds without a professional security audit.

---

## Built With

| Layer | Stack |
|-------|-------|
| Smart contract | Rust + Anchor 0.32.1 |
| Network | Solana Devnet |
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Wallet | @solana/wallet-adapter (Phantom, Solflare, Coinbase, Torus) |
| REST API | Node.js, Express, TypeScript, SQLite |
| Pricing engine | Python 3.11, FastAPI, Pydantic |
| Testing | Anchor/Mocha (8 integration tests) |
| Deployment | Vercel (frontend), Railway (APIs) |
