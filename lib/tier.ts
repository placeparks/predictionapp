export type Snapshot = {
    tx_count: number;
    unique_peers: number;
    erc20_count: number;
    erc20_usd: number;
    nft_collections: number;
    nft_count: number;
    has_basename: boolean;
    basename?: string; // Optional actual basename value
  };
  
  export function computeTier(s: Snapshot) {
    // Normalize values (some unused but kept for potential future tier requirements)
    const tx_count = Math.max(0, s.tx_count ?? 0);
    const _unique_peers = Math.max(0, s.unique_peers ?? 0);
    const _erc20_count = Math.max(0, s.erc20_count ?? 0);
    const _nft_collections = Math.max(0, s.nft_collections ?? 0);
    const _nft_count = Math.max(0, s.nft_count ?? 0);

    // Evaluate from highest to lowest
    if (tx_count >= 105 && s.has_basename) return 5;
    if (tx_count >= 32) return 4;
    if (tx_count >= 23) return 3;
    if (tx_count >= 12) return 2;
    if (tx_count >= 1) return 1; // require at least 1 tx
    return 0;
  }

  // Strict eligibility: all requirements for a tier must be satisfied (AND semantics)
  export function meetsTierRequirements(s: Snapshot, tier: number): boolean {
    const tx_count = Math.max(0, s.tx_count ?? 0);
    const _unique_peers = Math.max(0, s.unique_peers ?? 0);
    const _erc20_count = Math.max(0, s.erc20_count ?? 0);
    const _nft_collections = Math.max(0, s.nft_collections ?? 0);
    const _nft_count = Math.max(0, s.nft_count ?? 0);

    switch (tier) {
      case 5:
        return tx_count >= 105 && !!s.has_basename;
      case 4:
        return tx_count >= 32;
      case 3:
        return tx_count >= 23;
      case 2:
        return tx_count >= 12;
      case 1:
        return tx_count >= 1;
      default:
        return false;
    }
  }
  
  export function animalFor(tier: number) {
    return ["Tadpole","Goat","Fox","Tiger","Dragon","Phoenix"][tier] ?? "Tadpole";
  }
  