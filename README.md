# 🐜 MYRMEX — Decentralized Parametric Insurance on Solana

> Parametric insurance that pays instantly when oracles confirm real-world trigger events. No adjusters. No claims process. Community liquidity pools. AI-priced premiums.

## Live Demo

- **Frontend:** https://myrmex.vercel.app *(deploy pending)*
- **REST API:** https://myrmex-api.railway.app *(deploy pending)*
- **Pricing API:** https://myrmex-pricing.railway.app *(deploy pending)*
- **Program (devnet):** `9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan`
- **Explorer:** https://explorer.solana.com/address/9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan?cluster=devnet

## Demo Video

*[3-minute demo video — link TBD]*

---

## What It Does

MYRMEX removes the human adjuster from insurance. When a verifiable real-world event occurs — a flight delay, a drought, a DeFi exploit — an oracle posts the value on-chain, and the smart contract automatically transfers the payout to the policyholder. Liquidity providers fund the pools and earn premiums. AI models price the risk.

### Coverage Types

| Type | Trigger | Example |
|------|---------|---------|
| Flight Delay | Oracle posts delay minutes > threshold | BOM→DEL, 120min threshold |
| Crop Drought | Oracle posts rainfall mm < threshold | Maharashtra, 20mm/month |
| DeFi Hack | Oracle posts TVL drop % > threshold | Protocol TVL drop >50% |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | Rust + Anchor 0.32.1 |
| Network | Solana Devnet |
| Frontend | Next.js 14 (App Router), TypeScript |
| Wallet | @solana/wallet-adapter (Phantom) |
| REST API | Node.js + Express + TypeScript |
| Pricing Engine | Python FastAPI + actuarial models |
| Database | SQLite (policy indexer) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 14)                │
│  Buy Policy → Quote → Sign Tx → Explorer Link              │
└──────────────────┬───────────────────┬──────────────────────┘
                   │                   │
         ┌─────────▼──────┐   ┌────────▼──────────┐
         │  REST API       │   │  Pricing API       │
         │  (Express 3001) │   │  (FastAPI 8000)    │
         │  - /policies    │   │  - /quote          │
         │  - /pools       │   │  - Flight model    │
         │  - /simulate    │   │  - Weather model   │
         │  - /stats       │   │  - DeFi model      │
         └─────────┬───────┘   └────────────────────┘
                   │ Anchor RPC
         ┌─────────▼───────────────────────────────────────────┐
         │              SOLANA PROGRAM (Anchor 0.32.1)          │
         │                                                      │
         │  RiskPool PDA          PolicyVault PDA               │
         │  ┌──────────────┐      ┌──────────────────┐         │
         │  │ total_liq    │      │ payout_amount     │         │
         │  │ total_locked │      │ premium_amount    │         │
         │  │ lp_token_mint│      │ trigger_condition │         │
         │  │ vault (ATA)  │      │ is_claimed ← CEI  │         │
         │  └──────────────┘      └──────────────────┘         │
         │                                                      │
         │  Instructions: initialize_pool, fund_pool,           │
         │  create_policy, trigger_payout, expire_policy,       │
         │  withdraw_lp, stake_myr, cast_vote                   │
         └──────────────────────────────────────────────────────┘
```

### PDA Derivation

```
RiskPool:   ["pool",   authority, pool_type]
LP Mint:    ["lp_mint", pool_pda]
PolicyVault:["policy", policyholder, pool_pda, nonce_le_bytes]
```

### Security Invariants

- **Checks-Effects-Interactions**: `is_claimed = true` is set *before* the SPL token transfer in `trigger_payout`, preventing reentrancy.
- **Double-payout guard**: Once `is_claimed = true`, the `require!(!policy.is_claimed)` constraint rejects any second call.
- **Checked arithmetic**: All u64/u128 operations use `checked_add`, `checked_mul`, `checked_sub`, `checked_div` — plain operators forbidden.
- **Oracle validation**: Caller must match `policy.trigger_condition.oracle_pubkey` (signed transaction proves key ownership).
- **Collateral lock**: `trigger_payout` and `create_policy` update `total_locked`; `withdraw_lp` blocks withdrawals that would reduce available liquidity below locked amount.

---

## Contract Addresses

| Network | Program ID |
|---------|-----------|
| Devnet | `9naJhrt9FdAHLwdLnQfgx6citNgEWmW8aLovCS9kYpan` |
| Mainnet | Not deployed |

---

## Local Setup

### Prerequisites

- Rust + Anchor 0.32.1
- Solana CLI 2.x
- Node.js 18+
- Python 3.11+
- Yarn

### 1. Build & test the program

```bash
# From repo root
anchor build
anchor test
```

All 8 tests should pass.

### 2. Start the pricing API

```bash
cd pricing
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Test: `curl -X POST http://localhost:8000/quote -H "Content-Type: application/json" -d '{"coverage_type":"flight_delay","payout_amount_usdc":100,"duration_days":30,"origin":"BOM","destination":"DEL","delay_threshold_minutes":120}'`

### 3. Start the REST API

```bash
cd api
npm install
cp .env.example .env   # edit SERVER_KEYPAIR
npm run dev
```

Test: `curl http://localhost:3001/health`

### 4. Start the frontend

```bash
cd app
npm install
cp .env.local.example .env.local   # already configured for devnet
npm run dev
```

Open http://localhost:3000

### 5. Run the E2E test (localnet)

```bash
# Ensure local validator is running
solana-test-validator &

npx ts-node tests/e2e/full-flow.ts
```

---

## API Reference

### Pricing API (port 8000)

```
POST /quote
Body: { coverage_type, payout_amount_usdc, duration_days, ...coverage-specific params }
Returns: { premium_usdc, risk_score, model_version, coverage_type }
```

### REST API (port 3001)

```
GET  /api/pools                          - all risk pools from chain
GET  /api/policies?policyholder=<pubkey> - policies for a wallet
GET  /api/stats                          - TVL, active policies, pool count
POST /api/quote                          - proxy to pricing API
POST /api/simulate-trigger               - trigger a payout (demo/testing)
GET  /health                             - liveness check
```

---

## Known Limitations

1. **Mock oracle**: The demo uses the connected wallet as the oracle signer. A production deployment would integrate Switchboard or Pyth for trustless oracle feeds.
2. **No governance token**: The MYR staking and governance vote instructions are scaffolded but the MYR token mint is not deployed on devnet.
3. **Single pool admin**: Pool initialization requires a single authority keypair. Multi-sig governance is planned.
4. **USDC**: Tests use a locally minted test USDC. Devnet USDC address: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
5. **No audit**: This is a hackathon prototype. Do not deploy with real funds without a professional security audit.
