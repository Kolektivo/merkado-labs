// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MerkadoRentOfferV1
/// @notice Non-upgradeable ERC-721 contract that pools Circle native USDC rent
///         for Merkado rent offers. Each tokenId represents one approved offer.
///         The Company Safe mints one offer NFT per approved listing. NFTs are
///         fully transferable: the current token owner is the holder.
/// @dev    Base Sepolia testnet-only demo contract. Rent liabilities are tracked
///         per tokenId and the contract always keeps
///         `usdc.balanceOf(address(this)) >= totalRentLiability`.
contract MerkadoRentOfferV1 is ERC721, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Immutable per-offer terms, permanently locked at mint time.
    struct OfferTerms {
        bytes32 offerKey;
        address payoutAddress;
        uint256 purchasePrice; // USDC atomic (6 decimals)
        uint256 rentInstallmentAmount; // USDC atomic
        bool purchased;
    }

    /// @notice offerKey => locked offer terms keyed by tokenId.
    mapping(uint256 => OfferTerms) public offers;

    /// @notice tokenId => unclaimed rent (USDC atomic) owed to the current holder.
    mapping(uint256 => uint256) public claimableRent;

    /// @notice opaque renter payment id => already consumed.
    mapping(bytes32 => bool) public usedPaymentIds;

    /// @notice offerKey => already minted (prevents duplicate offers).
    mapping(bytes32 => bool) public usedOfferKeys;

    /// @notice Sum of all claimable rent across every tokenId (USDC atomic).
    uint256 public totalRentLiability;

    /// @dev Next tokenId to mint, starting at 1.
    uint256 private _nextTokenId = 1;

    /// @notice The pooled USDC token accepted by this contract.
    IERC20 public immutable usdc;

    /// @notice The Company Safe. Only it may mint offers.
    address public immutable companySafe;

    /// @notice Offer minted by the Company Safe.
    event OfferMinted(
        uint256 indexed tokenId,
        bytes32 indexed offerKey,
        address payoutAddress,
        uint256 purchasePrice,
        uint256 rentInstallmentAmount
    );

    /// @notice A buyer purchased a whole offer directly from the Company Safe.
    event OfferPurchased(
        uint256 indexed tokenId,
        address indexed buyer,
        address indexed payoutAddress,
        uint256 purchasePrice
    );

    /// @notice A renter deposited one rent installment for a purchased offer.
    event RentDeposited(
        uint256 indexed tokenId,
        bytes32 indexed paymentId,
        address indexed payer,
        uint256 amount
    );

    /// @notice The holder claimed the full claimable rent for a token.
    event RentClaimed(uint256 indexed tokenId, address indexed owner, uint256 amount);

    error NotCompanySafe();
    error OfferAlreadyPurchased();
    error TokenNotPurchased();
    error TokenNotExists();
    error InvalidPaymentId();
    error AmountMismatch();
    error NotOwner();
    error ZeroClaim();
    error OfferKeyUsed();
    error ZeroAddress();
    error ZeroPayoutAddress();
    error ZeroPurchasePrice();
    error ZeroInstallment();

    /// @param usdc_ The pooled Circle native USDC token address.
    /// @param companySafe_ The Company Safe allowed to mint offers.
    constructor(address usdc_, address companySafe_) ERC721("Merkado Rent Offer", "MRO") {
        if (usdc_ == address(0) || companySafe_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
        companySafe = companySafe_;
    }

    /// @notice The Company Safe mints one offer NFT per approved listing.
    /// @param offerKey Unique offer identifier. Cannot be reused.
    /// @param payoutAddress Locked landlord payout address (purchase price goes here).
    /// @param purchasePrice Whole-offer purchase price in USDC atomic units.
    /// @param rentInstallmentAmount Single rent installment in USDC atomic units.
    /// @return tokenId The minted token id.
    function mintOffer(
        bytes32 offerKey,
        address payoutAddress,
        uint256 purchasePrice,
        uint256 rentInstallmentAmount
    ) external returns (uint256 tokenId) {
        if (msg.sender != companySafe) revert NotCompanySafe();
        if (payoutAddress == address(0)) revert ZeroPayoutAddress();
        if (purchasePrice == 0) revert ZeroPurchasePrice();
        if (rentInstallmentAmount == 0) revert ZeroInstallment();
        if (offerKey == bytes32(0) || usedOfferKeys[offerKey]) revert OfferKeyUsed();

        usedOfferKeys[offerKey] = true;
        tokenId = _nextTokenId;
        _nextTokenId += 1;

        offers[tokenId] = OfferTerms({
            offerKey: offerKey,
            payoutAddress: payoutAddress,
            purchasePrice: purchasePrice,
            rentInstallmentAmount: rentInstallmentAmount,
            purchased: false
        });

        _safeMint(companySafe, tokenId);

        emit OfferMinted(tokenId, offerKey, payoutAddress, purchasePrice, rentInstallmentAmount);
    }

    /// @notice Anyone can purchase a whole offer. The exact purchase price is paid
    ///         directly to the locked landlord payout address and the NFT moves
    ///         from the Company Safe to the buyer atomically. No fee is charged.
    /// @param tokenId The offer token to purchase.
    function purchase(uint256 tokenId) external nonReentrant {
        _purchase(tokenId);
    }

    /// @dev Shared purchase logic. Checks-effects-interactions: marks the offer
    ///      purchased before any external call so a failed USDC transfer rolls back
    ///      the whole transaction and the NFT never moves.
    function _purchase(uint256 tokenId) internal {
        OfferTerms storage offer = offers[tokenId];
        if (offer.offerKey == bytes32(0)) revert TokenNotExists();
        if (offer.purchased) revert OfferAlreadyPurchased();

        offer.purchased = true;

        address payoutAddress = offer.payoutAddress;
        uint256 purchasePrice = offer.purchasePrice;

        usdc.safeTransferFrom(msg.sender, payoutAddress, purchasePrice);

        _transfer(companySafe, msg.sender, tokenId);

        emit OfferPurchased(tokenId, msg.sender, payoutAddress, purchasePrice);
    }

    /// @notice A renter deposits one rent installment for a purchased offer.
    /// @param tokenId The purchased offer token.
    /// @param paymentId Opaque renter payment id, unique per payment.
    /// @param amount The exact rent installment in USDC atomic units.
    function depositRent(uint256 tokenId, bytes32 paymentId, uint256 amount) external nonReentrant {
        OfferTerms storage offer = offers[tokenId];
        if (offer.offerKey == bytes32(0)) revert TokenNotExists();
        if (!offer.purchased) revert TokenNotPurchased();
        if (paymentId == bytes32(0) || usedPaymentIds[paymentId]) revert InvalidPaymentId();
        if (amount != offer.rentInstallmentAmount) revert AmountMismatch();

        // Effects before external transfer.
        usedPaymentIds[paymentId] = true;
        claimableRent[tokenId] += amount;
        totalRentLiability += amount;

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit RentDeposited(tokenId, paymentId, msg.sender, amount);
    }

    /// @notice The current token owner (holder) claims the token's full claimable rent.
    /// @param tokenId The offer token whose claimable rent is claimed.
    function claimRent(uint256 tokenId) external nonReentrant {
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();

        uint256 amount = claimableRent[tokenId];
        if (amount == 0) revert ZeroClaim();

        // Effects before external transfer.
        claimableRent[tokenId] = 0;
        totalRentLiability -= amount;

        usdc.safeTransfer(msg.sender, amount);

        emit RentClaimed(tokenId, msg.sender, amount);
    }
}