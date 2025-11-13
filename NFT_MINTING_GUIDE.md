# NFT Minting System Guide

## Overview
This system generates and mints NFTs based on user's on-chain wallet stats. Each NFT is a unique trading card featuring:
- The user's tier animal (Tadpole, Fox, Wolf, Tiger, Dragon, or Phoenix)
- Overlaid real-time stats (transactions, unique peers, ERC-20s, NFTs, etc.)
- Wallet address
- Tier level

## Setup Required

### 1. Environment Variables
Add these to your `.env` file:

```env
# NFT Contract Address (your ERC721 contract)
NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=0x...

# IPFS Configuration (optional - using public IPFS by default)
INFURA_IPFS_AUTH=Basic ...
# OR use Pinata or NFT.Storage instead
```

### 2. Animal Images
Place your animal images in `public/images/` folder with these names:
- `tadpole.png` (or `.jpg`)
- `fox.png`
- `wolf.png`
- `tiger.png`
- `dragon.png`
- `phoenix.png`

**Image Requirements:**
- Recommended size: 1024x1024 pixels
- Format: PNG or JPG
- If image not found, a gradient background with animal name will be used as fallback

## How It Works

### Flow:
1. **User connects wallet** → Stats are fetched from `/api/stats`
2. **User clicks "Mint NFT"** → 
   - Image is generated with stats overlaid
   - Image and metadata uploaded to IPFS
   - NFT is minted on-chain using ERC721 contract

### Files Structure:

```
lib/
  ├── imageGenerator.ts     # Generates NFT images with stats overlay
  ├── nft.ts                  # ERC721 contract ABI and utilities
  ├── tier.ts                 # Tier calculation logic

app/api/
  ├── generate-nft-image/    # API to generate NFT image (optional direct access)
  ├── upload-ipfs/            # Uploads image + metadata to IPFS, returns metadata URI
  ├── stats/                  # Fetches user wallet stats

app/page.tsx                  # Main UI with mint button
```

## API Endpoints

### POST `/api/upload-ipfs`
Generates NFT image, uploads to IPFS, returns metadata URI.

**Request:**
```json
{
  "address": "0x...",
  "stats": {
    "tx_count": 100,
    "unique_peers": 20,
    "erc20_count": 5,
    ...
  }
}
```

**Response:**
```json
{
  "ok": true,
  "metadataUrl": "https://ipfs.io/ipfs/Qm...",
  "tier": 3,
  "animal": "Wolf"
}
```

## Minting Process

When user clicks "Mint NFT":

1. **Image Generation** (`lib/imageGenerator.ts`):
   - Loads animal image based on tier
   - Overlays stats text on image
   - Returns PNG buffer

2. **IPFS Upload** (`app/api/upload-ipfs/route.ts`):
   - Uploads image to IPFS → gets image CID
   - Creates metadata JSON with attributes
   - Uploads metadata to IPFS → gets metadata CID
   - Returns metadata URI

3. **On-Chain Mint** (frontend):
   - Calls ERC721 `safeMint(to, metadataURI)`
   - User approves transaction in wallet
   - NFT is minted!

## ERC721 Contract Requirements

Your contract must have:
```solidity
function safeMint(address to, string memory uri) public {
    // Your minting logic
    // Use uri as the tokenURI for the minted token
}
```

## Customization

### Image Layout
Edit `lib/imageGenerator.ts` to customize:
- Text positions
- Fonts and sizes
- Colors and overlays
- Stats displayed

### Stats Displayed
Current stats shown on NFT:
- Tier and Animal name (top)
- Transactions
- Unique Peers
- ERC-20 Count
- NFT Collections
- NFT Count
- ERC-20 USD Value
- Wallet address (bottom)

## Troubleshooting

### Image not found error:
- Check images are in `public/images/` folder
- Verify naming matches: `{animal}.png` (lowercase)
- Fallback gradient will be used if image missing

### IPFS upload fails:
- Check IPFS client configuration
- May need to set up Infura IPFS or use Pinata/NFT.Storage
- Update `app/api/upload-ipfs/route.ts` with your IPFS provider

### Minting fails:
- Verify `NEXT_PUBLIC_NFT_CONTRACT_ADDRESS` is set
- Check contract has `safeMint` function
- Ensure user has sufficient gas

## Next Steps

1. Deploy your ERC721 contract to Base Sepolia
2. Add contract address to `.env`
3. Add animal images to `public/images/`
4. Test minting flow!

# NFT Minting System Guide

## Overview
This app mints tier badges as ERC-721 tokens based on a wallet’s on-chain activity. Each token is a trading card image with overlaid stats and a tier animal. Minting uses EIP-712 signatures, and token metadata is frozen at mint time via an IPFS snapshot.

## Setup Required

### 1. Environment Variables
Add these to `.env` (and `.env.local` for Next.js):

```env
# Chain + RPC
NEXT_PUBLIC_CHAIN_ID=84532              # 84532 (Base Sepolia) or 8453 (Base)
ALCHEMY_API_KEY=...                     # For stats gathering

# NFT Contract
NEXT_PUBLIC_NFT_CONTRACT_ADDRESS=0x...  # Deployed TierBadge address
NEXT_PUBLIC_NFT_CONTRACT_NAME="Base Tier Badge"  # Must match contract name for EIP-712 domain

# Supabase (snapshot tracking)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# IPFS (Pinata)
PINATA_JWT=...                          # Used by /api/upload-ipfs
```

### 2. Animal Images
Place images in `public/images/`:
- `tadpole.png`, `goat.png`, `fox.png`, `tiger.png`, `dragon.png`, `phoenix.png` (PNG/JPG, ~1024×1024)
Note: A fallback gradient renders if an image is missing. Also handles the legacy `pheonix.png` filename.

## How It Works

### Flow
1. Connect wallet → `/api/stats` computes tier from on-chain data.
2. Click Mint/Upgrade → `/api/upload-ipfs` generates image and uploads image+metadata to IPFS; returns `metadataUrl`, `tier`, `animal`.
3. Sign typed data → `/api/sign-mint` returns EIP-712 payload for Mint or Upgrade.
4. Write on-chain → Frontend calls `mintWithSig` or `upgradeWithSig` on the contract.
5. Record snapshot → `/api/record-mint` stores `minted_token_id` and `minted_metadata_url` in Supabase.

### Snapshot Behavior (Frozen at Mint)
- Metadata and image for a token are fixed at mint time using the stored `minted_metadata_url`.
- `/api/metadata/:id.json` and `/api/image/:id.png` first try Supabase → IPFS snapshot; if none exists (pre-mint), they fall back to rendering from current stats.
- Upgrading burns the old token and mints a new token ID reflecting the new stats.

## Files

```
lib/
  imageGenerator.ts   # Draws the card image from tier/stats
  nft.ts              # TierBadge ABI and helpers
  tier.ts             # Tier computation and animal mapping

app/api/
  stats/              # Collects on-chain stats via Alchemy
  upload-ipfs/        # Generates image + uploads image/metadata to IPFS (Pinata)
  sign-mint/          # Builds EIP-712 typed data for user signature
  record-mint/        # Records minted snapshot in Supabase
  metadata/[id]/      # Serves frozen metadata (prefers minted snapshot)
  image/[id]/         # Serves frozen image (prefers minted snapshot)

app/page.tsx          # Main UI and mint/upgrade flow
contracts/TierBadge.sol
```

## API Endpoints

- POST `/api/upload-ipfs` → { ok, metadataUrl, tier, animal }
- POST `/api/sign-mint` → { ok, action, domain, types, message, nonce, deadline }
- POST `/api/record-mint` → persists minted token snapshot
- GET `/api/metadata/:id.json` → returns frozen metadata (snapshot) or current stats fallback
- GET `/api/image/:id.png` → returns frozen image (snapshot) or generated fallback

## Minting/Upgrade (EIP-712)

- Mint: `mintWithSig(address to, uint256 tokenId, uint256 nonce, uint256 deadline, bytes signature)`
- Upgrade: `upgradeWithSig(address to, uint256 burnTokenId, uint256 newTokenId, uint256 nonce, uint256 deadline, bytes signature)`
- The user signs the typed data; the contract verifies `recover == to` and nonce/deadline.
- `perWalletMax=1`. Upgrade burns first, then mints, preserving the cap.

## Contract Notes

- `tokenURI(tokenId)` = `baseURI + tokenId + ".json"`. Set `baseURI` to your app: `https://your.app/api/metadata/`.
- Optional controls: `setTransfersLocked(bool)`, `setPerWalletMax(uint256)`.

## Troubleshooting

- Pinata quota errors → upgrade plan or set a new `PINATA_JWT`.
- Wrong network for EIP-712 → ensure `NEXT_PUBLIC_CHAIN_ID` matches deployed chain.
- Metadata not updating after mint → expected; tokens are frozen at mint. Use Upgrade to reflect new stats.

## Next Steps

1. Deploy `TierBadge.sol` to Base Sepolia or Base.
2. Set env vars (contract address, chain id, Alchemy, Supabase, Pinata).
3. Verify images in `public/images/`.
4. Mint, then hit `/api/metadata/{id}.json` and `/api/image/{id}.png`.
