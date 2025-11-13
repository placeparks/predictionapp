TierBadge ERC‑721

Overview
- Standard ERC‑721 that points tokenURI to your Next.js API: `{baseURI}/{tokenId}.json`.
- Evolutive metadata lives off‑chain in `/api/metadata/:tokenId.json` and image in `/api/image/:tokenId.png`.
- Optional server‑authorized minting via EIP‑712 signature (set a `signer`).

Key functions
- `setBaseURI(string)`: owner sets base (e.g. `https://your.app/api/metadata/`).
- `ownerMint(address)`: owner mints next incremental id.
- `ownerMintTo(address,uint256)`: owner mints specific id.
- `mintWithSig(address to,uint256 tokenId,uint256 nonce,uint256 deadline,bytes signature)`: server‑authorized mint.
- `nonces(address)`: per‑recipient nonce used in signatures.

Signature schema (EIP‑712)
- Domain: name = token name, version = "1", chainId = current, verifyingContract = contract address.
- Type: `Mint(address to,uint256 tokenId,uint256 nonce,uint256 deadline)`
- The server should:
  1) Read current `nonces(to)` via RPC.
  2) Create the typed data with that nonce and a reasonable `deadline`.
  3) Sign with the private key that corresponds to `signer`.
  4) Client calls `mintWithSig(...)` with those params + signature.

Tiering model
- Contract does not compute tiers on‑chain. Your API should compute tier/animal at request time and render metadata accordingly.
- Example metadata route: `/api/metadata/:tokenId.json` that looks up the token owner, fetches wallet stats, computes tier, and returns name/image/attributes.

Deploy tips
- Imports OpenZeppelin contracts; compile with Hardhat or Foundry.
- Constructor args: `name`, `symbol`, `baseURI` (e.g. `https://your.app/api/metadata/`).
- Recommended chain IDs: Base Sepolia (84532) for dev; Base (8453) for prod.
TierBadge ERC-721

Overview
- ERC-721 that serves `tokenURI` from your Next.js API: `{baseURI}/{tokenId}.json`.
- Metadata is frozen at mint via an IPFS snapshot recorded in Supabase; API prefers the snapshot and falls back to live stats before first mint.
- EIP-712 self-authorized mint/upgrade: the recipient wallet signs; contract verifies `recover == to` and enforces nonce/deadline.

Key functions
- `setBaseURI(string)`: owner sets base (e.g., `https://your.app/api/metadata/`).
- `ownerMint(address)`: owner mints next incremental id.
- `ownerMintTo(address,uint256)`: owner mints specific id.
- `mintWithSig(address to,uint256 tokenId,uint256 nonce,uint256 deadline,bytes signature)`.
- `upgradeWithSig(address to,uint256 burnTokenId,uint256 newTokenId,uint256 nonce,uint256 deadline,bytes signature)`.
- `setTransfersLocked(bool)` and `setPerWalletMax(uint256)` controls.

Signature schema (EIP-712)
- Domain: `name` = contract name, `version` = "1", `chainId`, `verifyingContract`.
- Types:
  - `Mint(address to,uint256 tokenId,uint256 nonce,uint256 deadline)`
  - `Upgrade(address to,uint256 burnTokenId,uint256 newTokenId,uint256 nonce,uint256 deadline)`
- Server returns typed data; user signs; frontend calls contract with the signature.

Metadata model
- API routes:
  - `/api/metadata/:id.json` → returns minted IPFS metadata if recorded; otherwise computes from current stats.
  - `/api/image/:id.png` → proxies IPFS image or regenerates from metadata attributes; otherwise computes from current stats.

Deploy tips
- Uses OpenZeppelin; compile with Hardhat or Foundry.
- Constructor: `name`, `symbol`, `baseURI`.
- Chains: Base Sepolia (84532) for dev; Base (8453) for prod.
