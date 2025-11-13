// TierBadge Contract ABI - matching TierBadge.sol exactly
export const TIER_BADGE_ABI = [
  // Signature-based minting (requires off-chain signer)
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'uint256', name: 'nonce', type: 'uint256' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      { internalType: 'bytes', name: 'signature', type: 'bytes' },
    ],
    name: 'mintWithSig',
    outputs: [{ internalType: 'uint256', name: 'mintedId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Upgrade function (burn old token, mint new one)
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'burnTokenId', type: 'uint256' },
      { internalType: 'uint256', name: 'newTokenId', type: 'uint256' },
      { internalType: 'uint256', name: 'nonce', type: 'uint256' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
      { internalType: 'bytes', name: 'signature', type: 'bytes' },
    ],
    name: 'upgradeWithSig',
    outputs: [{ internalType: 'uint256', name: 'mintedId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Owner mint with auto-increment ID
  {
    inputs: [{ internalType: 'address', name: 'to', type: 'address' }],
    name: 'ownerMint',
    outputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Owner mint to specific token ID
  {
    inputs: [
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'ownerMintTo',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Read nonce for address
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'nonces',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Standard ERC721 ownerOf
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  // tokenURI
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  // balanceOf
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // name (ERC721 standard)
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Legacy export for backward compatibility - use TIER_BADGE_ABI instead
export const ERC721_MINT_ABI = TIER_BADGE_ABI;

// Get the contract address from environment or use a default
export function getNFTContractAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS;
  if (!address) {
    throw new Error('NEXT_PUBLIC_NFT_CONTRACT_ADDRESS not set');
  }
  if (!address.startsWith('0x') || address.length !== 42) {
    throw new Error('Invalid NFT contract address');
  }
  return address as `0x${string}`;
}

