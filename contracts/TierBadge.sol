// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title TierBadge – evolutive, signature-gated ERC-721 for Mini App wallet tiers
/// @notice Wallets self-authorize mints/upgrades via EIP-712 signatures. Contract enforces signature/nonce/deadline and (optional) soulbound + per-wallet cap.
/// @dev tokenURI = baseURI + tokenId + ".json" (serve dynamic JSON/images from your API)
contract TierBadge is ERC721, Ownable, EIP712 {
    using Strings for uint256;

    // -------- Storage --------
    string private _base;                 // off-chain metadata base
    uint256 public nextId = 1;           // auto-increment id source

    // Optional controls
    bool public transfersLocked;         // if true, disallow transfers (soulbound-like)
    uint256 public perWalletMax = 1;     // 1 = one badge per wallet (mint-time enforcement)

    // Per-recipient nonces for EIP-712 (replay protection)
    mapping(address => uint256) public nonces;

    // -------- EIP-712 typehashes --------
    // keccak256("Mint(address to,uint256 tokenId,uint256 nonce,uint256 deadline)")
    bytes32 private constant MINT_TYPEHASH =
        keccak256("Mint(address to,uint256 tokenId,uint256 nonce,uint256 deadline)");

    // keccak256("Upgrade(address to,uint256 burnTokenId,uint256 newTokenId,uint256 nonce,uint256 deadline)")
    bytes32 private constant UPGRADE_TYPEHASH =
        keccak256("Upgrade(address to,uint256 burnTokenId,uint256 newTokenId,uint256 nonce,uint256 deadline)");

    // -------- Events --------
    event BaseURISet(string baseURI);
    event TransfersLocked(bool locked);
    event PerWalletMaxSet(uint256 value);
    event Minted(address indexed to, uint256 indexed tokenId);
    event Upgraded(address indexed to, uint256 indexed fromTokenId, uint256 indexed toTokenId);

    // -------- Errors --------
    error SigExpired();
    error BadNonce();
    error BadSig();
    error AlreadyMinted();
    error MaxPerWallet();
    error TransfersLockedErr();
    error NotOwner();

    constructor(string memory name_, string memory symbol_, string memory baseURI_)
        ERC721(name_, symbol_)
        Ownable(msg.sender)              // OZ v5: pass initial owner
        EIP712(name_, "1")
    {
        _base = baseURI_;
    }

    // =========================
    // Admin
    // =========================

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _base = baseURI_;
        emit BaseURISet(baseURI_);
    }

    function setTransfersLocked(bool locked) external onlyOwner {
        transfersLocked = locked;
        emit TransfersLocked(locked);
    }

    /// @notice 0 disables the limit; 1 = one badge per wallet, etc.
    function setPerWalletMax(uint256 v) external onlyOwner {
        perWalletMax = v;
        emit PerWalletMaxSet(v);
    }

    /// @notice Owner mint with auto-increment id
    function ownerMint(address to) external onlyOwner returns (uint256 tokenId) {
        _enforcePerWalletMax(to);
        tokenId = nextId++;
        _safeMint(to, tokenId);
        emit Minted(to, tokenId);
    }

    /// @notice Owner mint to a specific id (e.g., if tying id to external DB)
    function ownerMintTo(address to, uint256 tokenId) external onlyOwner {
        _enforcePerWalletMax(to);
        if (_ownerOf(tokenId) != address(0)) revert AlreadyMinted();
        _safeMint(to, tokenId);
        if (tokenId >= nextId) nextId = tokenId + 1;
        emit Minted(to, tokenId);
    }

    // =========================
    // Signature-gated Mints/Upgrades
    // =========================

    /// @notice Mint authorized by the recipient wallet (self-signed EIP-712).
    /// @param to recipient wallet
    /// @param tokenId pass 0 to auto-assign, or a specific id
    /// @param nonce must equal nonces[to]
    /// @param deadline unix timestamp
    /// @param signature EIP-712 signature over Mint(...)
    function mintWithSig(
        address to,
        uint256 tokenId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 mintedId) {
        if (block.timestamp > deadline) revert SigExpired();
        if (nonce != nonces[to]) revert BadNonce();

        bytes32 structHash = keccak256(abi.encode(MINT_TYPEHASH, to, tokenId, nonce, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);
        // Only the recipient wallet can authorize its own mint
        if (ECDSA.recover(digest, signature) != to) revert BadSig();

        unchecked { nonces[to] = nonce + 1; }

        _enforcePerWalletMax(to);

        mintedId = tokenId == 0 ? nextId++ : tokenId;
        if (_ownerOf(mintedId) != address(0)) revert AlreadyMinted();

        _safeMint(to, mintedId);
        if (mintedId >= nextId) nextId = mintedId + 1;

        emit Minted(to, mintedId);
    }

    /// @notice Upgrade: burn an owned token and mint a new one, authorized by the recipient wallet.
    /// @dev Order: verify → consume nonce → burn (must own) → mint new. This keeps perWalletMax satisfied.
    function upgradeWithSig(
        address to,
        uint256 burnTokenId,
        uint256 newTokenId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 mintedId) {
        if (block.timestamp > deadline) revert SigExpired();
        if (nonce != nonces[to]) revert BadNonce();

        bytes32 structHash = keccak256(
            abi.encode(UPGRADE_TYPEHASH, to, burnTokenId, newTokenId, nonce, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        // Recipient wallet must approve the upgrade
        if (ECDSA.recover(digest, signature) != to) revert BadSig();

        unchecked { nonces[to] = nonce + 1; }

        // Must own the old token
        if (ownerOf(burnTokenId) != to) revert NotOwner();

        // Burn old first so balance decreases before mint (perWalletMax remains satisfied)
        _burn(burnTokenId);

        mintedId = (newTokenId == 0) ? nextId++ : newTokenId;
        if (_ownerOf(mintedId) != address(0)) revert AlreadyMinted();

        _safeMint(to, mintedId);
        if (mintedId >= nextId) nextId = mintedId + 1;

        emit Upgraded(to, burnTokenId, mintedId);
        emit Minted(to, mintedId);
    }

    // =========================
    // ERC721 hooks / views
    // =========================

    /// @dev Lock transfers if `transfersLocked` (mints and burns still allowed).
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        if (transfersLocked) {
            address from = _ownerOf(tokenId);
            bool isMint = (from == address(0));
            bool isBurn = (to == address(0));
            if (!isMint && !isBurn) revert TransfersLockedErr();
        }
        return super._update(to, tokenId, auth);
    }

    function _baseURI() internal view override returns (string memory) {
        return _base;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory base = _baseURI();
        return bytes(base).length == 0
            ? ""
            : string.concat(base, tokenId.toString(), ".json");
    }

    // =========================
    // Internals
    // =========================

    function _enforcePerWalletMax(address to) internal view {
        if (perWalletMax > 0 && balanceOf(to) >= perWalletMax) revert MaxPerWallet();
    }
}
