import { parseAbi } from "viem";

/**
 * Pinned Merkado NFT v1 contract ABI (Base Sepolia). Do not change:
 * events, functions, and views are the frozen surface the on-chain
 * verifier relies on.
 */
export const MERKADO_OFFER_ABI = parseAbi([
  // events
  "event OfferMinted(uint256 indexed tokenId, bytes32 indexed offerKey, address payoutAddress, uint256 purchasePrice, uint256 rentInstallmentAmount)",
  "event OfferPurchased(uint256 indexed tokenId, address indexed buyer, address indexed payoutAddress, uint256 purchasePrice)",
  "event RentDeposited(uint256 indexed tokenId, bytes32 indexed paymentId, address indexed payer, uint256 amount)",
  "event RentClaimed(uint256 indexed tokenId, address indexed owner, uint256 amount)",
  // functions
  "function mintOffer(bytes32 offerKey, address payoutAddress, uint256 purchasePrice, uint256 rentInstallmentAmount) returns (uint256)",
  "function purchase(uint256 tokenId)",
  "function depositRent(uint256 tokenId, bytes32 paymentId, uint256 amount)",
  "function claimRent(uint256 tokenId)",
  // views
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function offers(uint256) returns (bytes32, address, uint256, uint256, bool)",
  "function claimableRent(uint256) view returns (uint256)",
  "function totalRentLiability() returns (uint256)",
  "function usedPaymentIds(bytes32) returns (bool)",
  "function usdc() returns (address)",
  "function minter() returns (address)",
]);
