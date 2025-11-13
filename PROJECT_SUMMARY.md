Project Summary — ForecastFund Flow 2 Integration (USDC + Points)

Overview
- Implemented Flow 2 data-only predictions with Kalshi as oracle, USDC vault deposits, and stake points for predictions.
- Added a dev-friendly points system tied to USDC deposits (default: 1 USDC = 10 points).

Key Additions
- Predictions UI
  - Expanded market categories (crypto, politics, macro, economics, finance, tech, sports, other).
  - “My Picks Only” filter based on signed predictions.
  - EIP-712 signed Record flow (client) that stores predictions off-chain.
  - Header in main page shows Points and Cap (derived from vault shares).

- API Routes
  - POST/GET `/api/predictions` (app/api/predictions/route.ts)
    - Verifies EIP-712 signature.
    - Enforces soft-cap by ForecastVault shares (reads shares via viem; configurable by `NEXT_PUBLIC_FORECAST_VAULT_ADDRESS`).
    - Deducts stake points atomically via Supabase RPC.
    - Inserts into `predictions` with replay protection by `(user_address, nonce)`.
  - GET `/api/kalshi-public/[...path]` passthrough (existing) to Kalshi demo API.
  - GET `/api/vault/cap` (app/api/vault/cap/route.ts) — returns user cap from vault shares.
  - GET `/api/points` and POST `/api/points/purchase` — points balance + dev grant endpoint.

- Points Page
  - `/points` (app/points/page.tsx)
    - Approve USDC -> ERC-4626 deposit to ForecastVault -> server credits points.
    - Default mapping: 1 USDC = 10 points (configurable).
    - Added “Points” link to the main navbar.

- Database (Supabase)
  - supabase_predictions.sql
    - markets (optional cache), periods, predictions, outcomes, distributions.
    - Indexes and unique constraints (predictions unique by `(user_address, nonce)`).
  - supabase_points.sql
    - points_balances table.
    - grant_points(p_user, p_amount) and spend_points(p_user, p_amount) RPC helpers.

Environment Variables
- Required for predictions and cap:
  - `NEXT_PUBLIC_CHAIN_ID` (84532 for Base Sepolia, or 8453)
  - `NEXT_PUBLIC_FORECAST_REGISTRY=0xf03d0e14513D025cA072a45564AeEc3Edb4c1a1F`
  - `NEXT_PUBLIC_FORECAST_VAULT_ADDRESS=0x7cba78EF2CB282286B11DaD65249c1b00e5e8C0F`
  - `NEXT_PUBLIC_FORECAST_VAULT_ID=1`
  - `NEXT_PUBLIC_CURRENT_PERIOD_ID=1`
- Points purchase (client + server):
  - `NEXT_PUBLIC_USDC_ADDRESS` (Base Sepolia USDC default: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`)
  - `NEXT_PUBLIC_POINTS_PER_USDC=10` (client display)
  - `POINTS_PER_USDC=10` (optional server logic)
  - `ALLOW_DEV_POINTS_PURCHASE=true` (server credits points in dev)
- RPC (recommended):
  - `ALCHEMY_API_KEY` (used by cap checks and other APIs)

How to Test
1) DB: run `supabase_predictions.sql` and `supabase_points.sql` in Supabase SQL editor.
2) Env: ensure the variables above are set in `.env.local`.
3) Start app, connect wallet on Base Sepolia.
4) Go to `/points`, enter USDC amount (e.g., 1), approve USDC, deposit to vault, verify points credited (10 points).
5) Go to Predictions tab, pick a market, sign & record a prediction with stake points. If stake exceeds vault-based cap or points, request is rejected.
6) Use “My Picks Only” to filter your markets by recorded predictions.

Contract Addresses (provided)
- ForecastVault: `0x7cba78EF2CB282286B11DaD65249c1b00e5e8C0F`
- OutcomeDistributor: `0x242567dDa0ad695B4a2E9ca75f07887517b925ad`
- ForecastRegistry: `0xf03d0e14513D025cA072a45564AeEc3Edb4c1a1F`
- KalshiOutcomeOracle: `0x6FC2B2C2f7D40F8668Bd0d69343be19573871efF`
- Roles: Keeper/Pauser/WithdrawAllow `0x21A5625Fc19469c11555B5607eDB2B97324e7D82`

Known Items / Next Steps
- Build error: `app/components/KalshiPredictions.tsx` has invalid UTF‑8 characters in source (legacy file). The app may fail to compile until this file is cleaned or replaced. We added header info and server logic independently. If approved, we can replace this component with a clean version matching current flow.
- Optional: Add a server route to verify deposit tx and credit points without `ALLOW_DEV_POINTS_PURCHASE`.
- Optional: “My Predictions” table (side, stake, time) under the grid.

