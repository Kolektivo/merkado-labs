// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MerkadoRentOfferV1} from "../../contracts/MerkadoRentOfferV1.sol";
import {MockUSDC} from "../../contracts/mocks/MockUSDC.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20Errors, IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

/// @notice Malicious ERC-20 that tries to re-enter claimRent during a transfer.
/// @dev    Only used by the reentrancy test. One-shot attack flag.
contract ReentrantUSDC is ERC20 {
    MerkadoRentOfferV1 public target;
    uint256 public targetTokenId;
    bool public attackEnabled;

    constructor() ERC20("Reentrant USDC", "rUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function enableAttack(address target_, uint256 tokenId_) external {
        target = MerkadoRentOfferV1(target_);
        targetTokenId = tokenId_;
        attackEnabled = true;
    }

    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        if (attackEnabled && address(target) != address(0)) {
            attackEnabled = false;
            // Inner claim must be blocked by the reentrancy guard.
            try target.claimRent(targetTokenId) {} catch {}
        }
        return super.transfer(to, amount);
    }
}

contract MerkadoRentOfferV1Test is Test {
    uint256 internal constant PRICE = 10_206 * 10 ** 6; // 10,206.00 USDC
    uint256 internal constant INSTALLMENT = 1_800 * 10 ** 6; // 1,800.00 USDC
    uint256 internal constant MAX_DEPOSITS = 6;

    MockUSDC internal mock;
    MerkadoRentOfferV1 internal nft;

    address internal companySafe = makeAddr("companySafe");
    address internal buyer = makeAddr("buyer");
    address internal renter = makeAddr("renter");
    address internal other = makeAddr("other");
    address internal poorBuyer = makeAddr("poorBuyer");
    address internal poorBuyer2 = makeAddr("poorBuyer2");
    address internal payout1 = makeAddr("payout1");
    address internal payout2 = makeAddr("payout2");
    address internal payout3 = makeAddr("payout3");
    address internal payout4 = makeAddr("payout4");

    function setUp() public {
        mock = new MockUSDC();
        nft = new MerkadoRentOfferV1(address(mock), companySafe);
        _fund(renter, 10_000_000 * 10 ** 6);
        _fund(buyer, 10_000_000 * 10 ** 6);
    }

    function _fund(address who, uint256 amount) internal {
        mock.mint(who, amount);
        vm.prank(who);
        mock.approve(address(nft), type(uint256).max);
    }

    function _mintOffer(bytes32 key, address payout, uint256 price, uint256 installment)
        internal
        returns (uint256 tokenId)
    {
        vm.prank(companySafe);
        tokenId = nft.mintOffer(key, payout, price, installment);
    }

    function _purchase(uint256 tokenId) internal {
        vm.prank(buyer);
        nft.purchase(tokenId);
    }

    function _deposit(uint256 tokenId, bytes32 paymentId) internal {
        vm.prank(renter);
        nft.depositRent(tokenId, paymentId, INSTALLMENT);
    }

    function _assertSolvent() internal view {
        assertGe(mock.balanceOf(address(nft)), nft.totalRentLiability(), "solvency: balance < liability");
    }

    /// @dev Read a full OfferTerms struct from the public mapping getter, which
    ///      returns the struct components as a tuple.
    function _offer(uint256 tokenId) internal view returns (MerkadoRentOfferV1.OfferTerms memory) {
        (bytes32 offerKey, address payoutAddress, uint256 purchasePrice, uint256 rentInstallmentAmount, uint8 depositsRecorded, bool purchased) =
            nft.offers(tokenId);
        return MerkadoRentOfferV1.OfferTerms(
            offerKey, payoutAddress, purchasePrice, rentInstallmentAmount, depositsRecorded, purchased
        );
    }

    // 1. Non-Safe cannot mint.
    function test_NonSafeCannotMint() public {
        vm.prank(buyer);
        vm.expectRevert(MerkadoRentOfferV1.NotCompanySafe.selector);
        nft.mintOffer(keccak256("A"), payout1, PRICE, INSTALLMENT);
    }

    // 2. Mint rejects zero payout / price / installment and duplicate offerKey.
    function test_MintRejectsInvalidArgs() public {
        bytes32 key = keccak256("B");

        vm.startPrank(companySafe);
        vm.expectRevert(MerkadoRentOfferV1.ZeroPayoutAddress.selector);
        nft.mintOffer(key, address(0), PRICE, INSTALLMENT);

        vm.expectRevert(MerkadoRentOfferV1.ZeroPurchasePrice.selector);
        nft.mintOffer(key, payout1, 0, INSTALLMENT);

        vm.expectRevert(MerkadoRentOfferV1.ZeroInstallment.selector);
        nft.mintOffer(key, payout1, PRICE, 0);

        vm.expectRevert(MerkadoRentOfferV1.OfferKeyUsed.selector);
        nft.mintOffer(bytes32(0), payout1, PRICE, INSTALLMENT);
        vm.stopPrank();

        uint256 tokenId = _mintOffer(key, payout1, PRICE, INSTALLMENT);
        assertEq(tokenId, 1);

        vm.prank(companySafe);
        vm.expectRevert(MerkadoRentOfferV1.OfferKeyUsed.selector);
        nft.mintOffer(key, payout2, PRICE, INSTALLMENT);
    }

    // 3. Mint mints to companySafe, sets terms, emits OfferMinted, increments id.
    function test_MintMintsToCompanySafeAndEmits() public {
        bytes32 key = keccak256("C");

        vm.expectEmit(true, true, true, false, address(nft));
        emit MerkadoRentOfferV1.OfferMinted(1, key, payout1, PRICE, INSTALLMENT);
        uint256 tokenId = _mintOffer(key, payout1, PRICE, INSTALLMENT);

        assertEq(tokenId, 1, "first token id should be 1");
        assertEq(nft.ownerOf(tokenId), companySafe, "minted to companySafe");
        assertEq(nft.balanceOf(companySafe), 1);

        MerkadoRentOfferV1.OfferTerms memory t = _offer(tokenId);
        assertEq(t.offerKey, key);
        assertEq(t.payoutAddress, payout1);
        assertEq(t.purchasePrice, PRICE);
        assertEq(t.rentInstallmentAmount, INSTALLMENT);
        assertEq(t.depositsRecorded, 0);
        assertFalse(t.purchased);

        assertEq(nft.usedOfferKeys(key), true);

        // Next mint increments the id.
        uint256 second = _mintOffer(keccak256("D"), payout2, PRICE, INSTALLMENT);
        assertEq(second, 2);
    }

    // 4. Purchase rejects before mint, after purchase, when not owner-of-company,
    //    and when USDC allowance / balance is insufficient.
    function test_PurchaseRejects() public {
        // Before mint.
        vm.expectRevert(MerkadoRentOfferV1.TokenNotExists.selector);
        nft.purchase(1);

        // After purchase.
        uint256 tokenId = _mintOffer(keccak256("E"), payout1, PRICE, INSTALLMENT);
        _purchase(tokenId);
        vm.expectRevert(MerkadoRentOfferV1.OfferAlreadyPurchased.selector);
        nft.purchase(tokenId);

        // When the Company Safe no longer owns the token (transferred away),
        // the sale transfer fails and the whole purchase reverts.
        uint256 movedId = _mintOffer(keccak256("F"), payout2, PRICE, INSTALLMENT);
        vm.startPrank(companySafe);
        nft.transferFrom(companySafe, other, movedId);
        vm.stopPrank();
        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721IncorrectOwner.selector, companySafe, movedId, other)
        );
        nft.purchase(movedId);

        // Insufficient USDC allowance.
        uint256 noAllowance = _mintOffer(keccak256("G"), payout3, PRICE, INSTALLMENT);
        mock.mint(poorBuyer, PRICE);
        vm.prank(poorBuyer);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(nft), 0, PRICE
            )
        );
        nft.purchase(noAllowance);

        // Insufficient USDC balance (allowance set, no funds).
        uint256 noBalance = _mintOffer(keccak256("H"), payout4, PRICE, INSTALLMENT);
        vm.prank(poorBuyer2);
        mock.approve(address(nft), PRICE);
        vm.prank(poorBuyer2);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, poorBuyer2, 0, PRICE
            )
        );
        nft.purchase(noBalance);
    }

    // 5. Purchase pays EXACT price to payout, transfers NFT to buyer, marks
    //    purchased, emits OfferPurchased, and pays NO fee.
    function test_PurchasePaysExactAndTransfers() public {
        uint256 tokenId = _mintOffer(keccak256("I"), payout1, PRICE, INSTALLMENT);
        uint256 buyerBefore = mock.balanceOf(buyer);
        uint256 payoutBefore = mock.balanceOf(payout1);

        vm.expectEmit(true, true, true, false, address(nft));
        emit MerkadoRentOfferV1.OfferPurchased(tokenId, buyer, payout1, PRICE);
        _purchase(tokenId);

        assertEq(mock.balanceOf(payout1), payoutBefore + PRICE, "payout receives exact price");
        assertEq(mock.balanceOf(buyer), buyerBefore - PRICE, "buyer pays exactly the price");
        assertEq(nft.ownerOf(tokenId), buyer, "NFT moved to buyer");
        assertEq(nft.balanceOf(companySafe), 0, "companySafe no longer holds the NFT");
        assertEq(nft.balanceOf(buyer), 1);

        MerkadoRentOfferV1.OfferTerms memory t = _offer(tokenId);
        assertTrue(t.purchased, "offer marked purchased");

        // No fee: contract holds nothing and records no liability.
        assertEq(mock.balanceOf(address(nft)), 0, "no fee is retained by the contract");
        assertEq(nft.totalRentLiability(), 0, "purchase creates no rent liability");
    }

    // 6. Purchase is atomic: if the USDC transfer fails, the NFT stays with the
    //    Company Safe and `purchased` stays false.
    function test_PurchaseAtomic_OnUsdcFailure() public {
        uint256 tokenId = _mintOffer(keccak256("J"), payout1, PRICE, INSTALLMENT);
        uint256 payoutBefore = mock.balanceOf(payout1);

        // Buyer approves but has no balance.
        vm.prank(poorBuyer2);
        mock.approve(address(nft), PRICE);
        vm.prank(poorBuyer2);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, poorBuyer2, 0, PRICE)
        );
        nft.purchase(tokenId);

        assertEq(nft.ownerOf(tokenId), companySafe, "NFT stays with companySafe");
        assertEq(nft.balanceOf(poorBuyer2), 0, "buyer got nothing");
        assertFalse(_offer(tokenId).purchased, "offer not marked purchased");
        assertEq(mock.balanceOf(payout1), payoutBefore, "payout received nothing");
    }

    // 7. Purchase is atomic: if the sale/NFT transfer fails, no USDC moves.
    //    Scenario: the Company Safe transferred the NFT away before the sale,
    //    so `_transfer` reverts with ERC721IncorrectOwner.
    function test_PurchaseAtomic_OnNftTransferFailure() public {
        uint256 tokenId = _mintOffer(keccak256("K"), payout1, PRICE, INSTALLMENT);

        // Company Safe moves the NFT to `other` before purchase.
        vm.startPrank(companySafe);
        nft.transferFrom(companySafe, other, tokenId);
        vm.stopPrank();

        uint256 buyerBefore = mock.balanceOf(buyer);
        uint256 payoutBefore = mock.balanceOf(payout1);

        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721IncorrectOwner.selector, companySafe, tokenId, other)
        );
        nft.purchase(tokenId);

        assertEq(mock.balanceOf(buyer), buyerBefore, "buyer USDC unchanged");
        assertEq(mock.balanceOf(payout1), payoutBefore, "payout USDC unchanged");
        assertFalse(_offer(tokenId).purchased, "offer not marked purchased");
        assertEq(nft.ownerOf(tokenId), other, "NFT stays with the pre-transfer holder");
    }

    // 8. NFTs are transferable: after purchase the buyer can transfer the token;
    //    the new owner becomes the holder and can claim.
    function test_NftIsTransferable() public {
        uint256 tokenId = _mintOffer(keccak256("L"), payout1, PRICE, INSTALLMENT);
        _purchase(tokenId);
        _deposit(tokenId, keccak256("L-p1"));

        // transferFrom path.
        vm.prank(buyer);
        nft.transferFrom(buyer, other, tokenId);
        assertEq(nft.ownerOf(tokenId), other, "new owner after transferFrom");
        assertEq(nft.balanceOf(buyer), 0);
        assertEq(nft.balanceOf(other), 1);

        // New holder claims the deposited rent.
        uint256 otherBefore = mock.balanceOf(other);
        vm.prank(other);
        nft.claimRent(tokenId);
        assertEq(mock.balanceOf(other), otherBefore + INSTALLMENT, "new holder claimed rent");
        assertEq(nft.claimableRent(tokenId), 0);

        // safeTransferFrom path on a second token.
        uint256 token2 = _mintOffer(keccak256("M"), payout2, PRICE, INSTALLMENT);
        _purchase(token2);
        vm.prank(buyer);
        nft.safeTransferFrom(buyer, other, token2);
        assertEq(nft.ownerOf(token2), other, "new owner after safeTransferFrom");
        assertEq(nft.balanceOf(other), 2);

        // A third party cannot move tokens they do not own.
        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, renter, token2)
        );
        nft.transferFrom(renter, companySafe, token2);
    }
    // 9. depositRent rejects unknown token, unpurchased token, wrong amount,
    //    duplicate / zero paymentId, and the 7th deposit.
    function test_DepositRejects() public {
        // Unknown token.
        vm.expectRevert(MerkadoRentOfferV1.TokenNotExists.selector);
        nft.depositRent(999, keccak256("N1"), INSTALLMENT);

        // Unpurchased token.
        uint256 unpurchased = _mintOffer(keccak256("N"), payout1, PRICE, INSTALLMENT);
        vm.expectRevert(MerkadoRentOfferV1.TokenNotPurchased.selector);
        nft.depositRent(unpurchased, keccak256("N2"), INSTALLMENT);

        // Purchased token for the remaining rejections.
        uint256 tokenId = _mintOffer(keccak256("O"), payout1, PRICE, INSTALLMENT);
        _purchase(tokenId);

        // Wrong amount.
        vm.expectRevert(MerkadoRentOfferV1.AmountMismatch.selector);
        nft.depositRent(tokenId, keccak256("O1"), INSTALLMENT - 1);
        vm.expectRevert(MerkadoRentOfferV1.AmountMismatch.selector);
        nft.depositRent(tokenId, keccak256("O2"), INSTALLMENT + 1);

        // Zero paymentId.
        vm.expectRevert(MerkadoRentOfferV1.InvalidPaymentId.selector);
        nft.depositRent(tokenId, bytes32(0), INSTALLMENT);

        // Duplicate paymentId.
        _deposit(tokenId, keccak256("O3"));
        vm.expectRevert(MerkadoRentOfferV1.InvalidPaymentId.selector);
        nft.depositRent(tokenId, keccak256("O3"), INSTALLMENT);

        // 7th deposit is rejected.
        for (uint256 i = 1; i < MAX_DEPOSITS; i++) {
            _deposit(tokenId, keccak256(abi.encode("O", i)));
        }
        assertEq(_offer(tokenId).depositsRecorded, 6);
        vm.expectRevert(MerkadoRentOfferV1.TooManyDeposits.selector);
        nft.depositRent(tokenId, keccak256("O7"), INSTALLMENT);
    }

    // 10. depositRent records exact per-token liability, consumed paymentId,
    //     and totalRentLiability.
    function test_DepositRecordsLiability() public {
        uint256 tokenId = _mintOffer(keccak256("P"), payout1, PRICE, INSTALLMENT);
        _purchase(tokenId);

        for (uint256 i = 0; i < 6; i++) {
            bytes32 pid = keccak256(abi.encode("P", i));
            uint256 before = nft.totalRentLiability();
            vm.expectEmit(true, true, true, false, address(nft));
            emit MerkadoRentOfferV1.RentDeposited(tokenId, pid, renter, INSTALLMENT);
            _deposit(tokenId, pid);

            assertEq(nft.usedPaymentIds(pid), true, "paymentId consumed");
            assertEq(nft.claimableRent(tokenId), (i + 1) * INSTALLMENT, "per-token claimable");
            assertEq(nft.totalRentLiability(), before + INSTALLMENT, "total liability grows");
            assertEq(_offer(tokenId).depositsRecorded, uint8(i + 1), "deposits recorded");
            assertEq(mock.balanceOf(address(nft)), (i + 1) * INSTALLMENT, "pooled balance");
            _assertSolvent();
        }
    }

    // 11. Only the token owner can claim; the new owner after a transfer can claim.
    function test_ClaimOnlyOwner() public {
        uint256 tokenId = _mintOffer(keccak256("Q"), payout1, PRICE, INSTALLMENT);
        _purchase(tokenId);
        _deposit(tokenId, keccak256("Q1"));
        _deposit(tokenId, keccak256("Q2"));

        // Non-owner (renter) cannot claim.
        vm.prank(renter);
        vm.expectRevert(MerkadoRentOfferV1.NotOwner.selector);
        nft.claimRent(tokenId);

        // Transfer then the new owner can claim.
        vm.prank(buyer);
        nft.transferFrom(buyer, other, tokenId);
        uint256 otherBefore = mock.balanceOf(other);
        vm.prank(other);
        nft.claimRent(tokenId);
        assertEq(mock.balanceOf(other), otherBefore + 2 * INSTALLMENT, "new owner claims");
    }

    // 12. Claim pays the full claimable amount, sets liability to zero, cannot
    //     double-claim, and leaves other tokens' liabilities unchanged.
    function test_ClaimPaysFullAndNoDoubleClaim() public {
        uint256 tokenA = _mintOffer(keccak256("R"), payout1, PRICE, INSTALLMENT);
        uint256 tokenB = _mintOffer(keccak256("S"), payout2, PRICE, INSTALLMENT);
        _purchase(tokenA);
        _purchase(tokenB);

        _deposit(tokenA, keccak256("R1"));
        _deposit(tokenA, keccak256("R2"));
        _deposit(tokenA, keccak256("R3"));
        _deposit(tokenB, keccak256("S1"));

        uint256 totalBefore = nft.totalRentLiability();
        assertEq(totalBefore, 4 * INSTALLMENT, "both tokens pooled");

        uint256 buyerBefore = mock.balanceOf(buyer);
        vm.expectEmit(true, true, false, false, address(nft));
        emit MerkadoRentOfferV1.RentClaimed(tokenA, buyer, 3 * INSTALLMENT);
        vm.prank(buyer);
        nft.claimRent(tokenA);

        assertEq(mock.balanceOf(buyer), buyerBefore + 3 * INSTALLMENT, "full claimable paid");
        assertEq(nft.claimableRent(tokenA), 0, "token A liability zeroed");
        assertEq(nft.totalRentLiability(), totalBefore - 3 * INSTALLMENT, "total reduced");
        assertEq(nft.claimableRent(tokenB), INSTALLMENT, "token B liability unchanged");

        // Cannot double-claim.
        vm.prank(buyer);
        vm.expectRevert(MerkadoRentOfferV1.ZeroClaim.selector);
        nft.claimRent(tokenA);
        _assertSolvent();
    }

    // 13. Direct USDC transfers to the contract create NO liability and cannot
    //     be claimed.
    function test_DirectTransferCreatesNoLiability() public {
        uint256 tokenId = _mintOffer(keccak256("T"), payout1, PRICE, INSTALLMENT);
        _purchase(tokenId);

        vm.prank(renter);
        mock.transfer(address(nft), 5 * INSTALLMENT);

        assertEq(mock.balanceOf(address(nft)), 5 * INSTALLMENT, "balance increased");
        assertEq(nft.claimableRent(tokenId), 0, "no claimable created");
        assertEq(nft.totalRentLiability(), 0, "no liability created");

        vm.prank(buyer);
        vm.expectRevert(MerkadoRentOfferV1.ZeroClaim.selector);
        nft.claimRent(tokenId);
        _assertSolvent();
    }

    // 14. Reentrancy attempt on claim cannot double-pay.
    function test_ClaimReentrancyCannotDoublePay() public {
        ReentrantUSDC evil = new ReentrantUSDC();
        MerkadoRentOfferV1 nft2 = new MerkadoRentOfferV1(address(evil), companySafe);

        evil.mint(renter, 10_000_000 * 10 ** 6);
        evil.mint(buyer, 10_000_000 * 10 ** 6);
        vm.startPrank(renter);
        evil.approve(address(nft2), type(uint256).max);
        vm.stopPrank();
        vm.startPrank(buyer);
        evil.approve(address(nft2), type(uint256).max);
        vm.stopPrank();

        vm.prank(companySafe);
        uint256 tokenId = nft2.mintOffer(keccak256("U"), payout1, PRICE, INSTALLMENT);
        vm.prank(buyer);
        nft2.purchase(tokenId);
        vm.prank(renter);
        nft2.depositRent(tokenId, keccak256("U1"), INSTALLMENT);

        // Arm the malicious token to re-enter claimRent during the payout transfer.
        evil.enableAttack(address(nft2), tokenId);

        uint256 buyerBefore = evil.balanceOf(buyer);
        vm.prank(buyer);
        nft2.claimRent(tokenId);

        // Paid exactly once: the inner reentrant claim was blocked.
        assertEq(evil.balanceOf(buyer), buyerBefore + INSTALLMENT, "no double-pay");
        assertEq(nft2.claimableRent(tokenId), 0, "liability consumed");
        assertEq(nft2.totalRentLiability(), 0, "total liability consumed");
        assertGe(evil.balanceOf(address(nft2)), nft2.totalRentLiability());
    }

    // 15. Pause blocks mint/purchase/deposit but NOT claim; only Safe can pause.
    function test_PauseBlocksOpsNotClaim() public {
        // Pre-mint and pre-purchase while unpaused.
        uint256 claimable = _mintOffer(keccak256("V"), payout1, PRICE, INSTALLMENT);
        _purchase(claimable);
        _deposit(claimable, keccak256("V1"));

        uint256 unpurchased = _mintOffer(keccak256("V2"), payout2, PRICE, INSTALLMENT);
        uint256 purchasedNoDep = _mintOffer(keccak256("V3"), payout3, PRICE, INSTALLMENT);
        _purchase(purchasedNoDep);

        // Only the Safe can pause.
        vm.prank(buyer);
        vm.expectRevert(MerkadoRentOfferV1.NotCompanySafe.selector);
        nft.pause();

        vm.expectEmit(true, false, false, false, address(nft));
        emit MerkadoRentOfferV1.Paused(companySafe);
        vm.prank(companySafe);
        nft.pause();
        assertTrue(nft.paused(), "paused");

        // Re-pausing reverts.
        vm.prank(companySafe);
        vm.expectRevert(MerkadoRentOfferV1.AlreadyPaused.selector);
        nft.pause();

        // Mint, purchase, deposit are blocked while paused.
        vm.prank(companySafe);
        vm.expectRevert(MerkadoRentOfferV1.ContractPaused.selector);
        nft.mintOffer(keccak256("V4"), payout4, PRICE, INSTALLMENT);

        vm.prank(buyer);
        vm.expectRevert(MerkadoRentOfferV1.ContractPaused.selector);
        nft.purchase(unpurchased);

        vm.prank(renter);
        vm.expectRevert(MerkadoRentOfferV1.ContractPaused.selector);
        nft.depositRent(purchasedNoDep, keccak256("V5"), INSTALLMENT);

        // Claim is NOT blocked while paused.
        uint256 buyerBefore = mock.balanceOf(buyer);
        vm.prank(buyer);
        nft.claimRent(claimable);
        assertEq(mock.balanceOf(buyer), buyerBefore + INSTALLMENT, "claim works while paused");
        _assertSolvent();

        // Only the Safe can unpause.
        vm.prank(other);
        vm.expectRevert(MerkadoRentOfferV1.NotCompanySafe.selector);
        nft.unpause();

        vm.expectEmit(true, false, false, false, address(nft));
        emit MerkadoRentOfferV1.Unpaused(companySafe);
        vm.prank(companySafe);
        nft.unpause();
        assertFalse(nft.paused(), "unpaused");

        // Un-pausing again reverts.
        vm.prank(companySafe);
        vm.expectRevert(MerkadoRentOfferV1.NotPaused.selector);
        nft.unpause();
    }

    // 17. Six installments aggregate exactly and one claim pays the sum.
    function test_SixInstallmentsAggregateAndOneClaim() public {
        uint256 tokenId = _mintOffer(keccak256("W"), payout1, PRICE, INSTALLMENT);
        _purchase(tokenId);

        for (uint256 i = 0; i < 6; i++) {
            _deposit(tokenId, keccak256(abi.encode("W", i)));
        }
        assertEq(nft.claimableRent(tokenId), 6 * INSTALLMENT);
        assertEq(nft.totalRentLiability(), 6 * INSTALLMENT);
        assertEq(_offer(tokenId).depositsRecorded, 6);

        uint256 buyerBefore = mock.balanceOf(buyer);
        vm.prank(buyer);
        nft.claimRent(tokenId);
        assertEq(mock.balanceOf(buyer), buyerBefore + 6 * INSTALLMENT, "one claim pays the sum");
        assertEq(nft.claimableRent(tokenId), 0);
        assertEq(nft.totalRentLiability(), 0);
        _assertSolvent();
    }

    // 16. Solvency invariant fuzz: random purchase / deposit / claim sequences.
    function testFuzz_SolvencyInvariant(uint256 seed) public {
        seed = bound(seed, 1, type(uint128).max);

        vm.startPrank(companySafe);
        nft.mintOffer(keccak256("F1"), payout1, PRICE, INSTALLMENT); // token 1
        nft.mintOffer(keccak256("F2"), payout2, PRICE, INSTALLMENT); // token 2
        nft.mintOffer(keccak256("F3"), payout3, PRICE, INSTALLMENT); // token 3
        nft.mintOffer(keccak256("F4"), payout4, PRICE, INSTALLMENT); // token 4
        vm.stopPrank();

        // Tokens 1 and 2 are pre-purchased; 3 and 4 wait for a random purchase.
        vm.startPrank(buyer);
        nft.purchase(1);
        nft.purchase(2);
        vm.stopPrank();

        mock.mint(renter, 10_000_000 * 10 ** 6);
        mock.mint(buyer, 10_000_000 * 10 ** 6);

        bool[5] memory purchased = [false, true, true, false, false];
        uint8[5] memory deposits;
        uint256[5] memory claimed;

        uint256 state = seed;
        uint256 iterations = 100 + (seed % 300);
        uint256 paymentCounter = 0;

        for (uint256 i = 0; i < iterations; i++) {
            state = _nextRand(state);
            uint256 tokenId = (state % 4) + 1;
            state = _nextRand(state);
            uint256 op = state % 3;

            if (op == 0) {
                // Random purchase.
                if (!purchased[tokenId]) {
                    vm.prank(buyer);
                    nft.purchase(tokenId);
                    purchased[tokenId] = true;
                    _assertSolvent();
                }
            } else if (op == 1) {
                // Random deposit (max 6 per token, unique paymentId).
                if (purchased[tokenId] && deposits[tokenId] < 6) {
                    bytes32 pid = keccak256(abi.encode("fuzz", paymentCounter++, tokenId));
                    vm.prank(renter);
                    nft.depositRent(tokenId, pid, INSTALLMENT);
                    deposits[tokenId] += 1;
                    _assertSolvent();
                }
            } else {
                // Random claim.
                if (purchased[tokenId]) {
                    uint256 claimable = nft.claimableRent(tokenId);
                    if (claimable > 0) {
                        vm.prank(buyer);
                        nft.claimRent(tokenId);
                        claimed[tokenId] += claimable;
                        _assertSolvent();
                    }
                }
            }
        }

        // Final invariant and per-token liability accounting.
        _assertSolvent();
        for (uint256 t = 1; t <= 4; t++) {
            uint256 expected = uint256(deposits[t]) * INSTALLMENT - claimed[t];
            assertEq(nft.claimableRent(t), expected, "token liability mismatch");
            assertGe(claimed[t], uint256(0), "token liability cannot go negative");
        }
        assertEq(_offer(1).purchased, true);
        assertEq(_offer(2).purchased, true);
    }

    function _nextRand(uint256 s) internal pure returns (uint256) {
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        return s;
    }
}