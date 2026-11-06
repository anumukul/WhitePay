// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {WhitePayCheckout} from "../../src/WhitePayCheckout.sol";

interface ForkVm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
}

interface OfficialToken {
    function owner() external view returns (address);
    function mint(address, uint256) external;
    function balanceOf(address) external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function authorizationState(address, bytes32) external view returns (bool);
    function receiveWithAuthorization(address, address, uint256, uint256, uint256, bytes32, bytes calldata) external;
    function addToBlockedList(address) external;
}

/// @dev LOCAL FORK ONLY: impersonates the token owner to mint synthetic fork balances.
/// No actual testnet mint/payment, WBT gas charge, or mined receipt is demonstrated.
contract OfficialCheckoutForkTest {
    ForkVm constant vm = ForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    OfficialToken constant token = OfficialToken(0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7);
    uint256 constant PAYER_KEY = 0xF012345; // Public fork fixture, never fund on any network.
    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    address payer;
    address merchant = address(0xA01);
    address treasury = address(0xA02);
    WhitePayCheckout checkout;

    function setUp() public {
        require(block.chainid == 1874, "Run only with Whitechain Sepolia --fork-url");
        require(address(token).code.length > 0, "Missing official token; fork required");
        payer = vm.addr(PAYER_KEY);
        require(payer.balance == 0, "fork payer native balance must be zero");
        require(token.balanceOf(payer) == 0, "fork payer must start empty");
        vm.prank(token.owner());
        token.mint(payer, 20_000_000);
        address[] memory allowed = new address[](1);
        allowed[0] = address(token);
        checkout = new WhitePayCheckout(1874, allowed);
    }

    function terms() internal view returns (WhitePayCheckout.Order memory) {
        return WhitePayCheckout.Order({
            orderId: keccak256("fork-order"),
            payer: payer,
            merchant: merchant,
            amount: 5_000_000,
            fee: 5_000,
            feeRecipient: treasury,
            token: address(token),
            validAfter: block.timestamp - 1,
            validBefore: block.timestamp + 3600,
            quoteId: keccak256("fork-quote")
        });
    }

    function sign(bytes32 digest) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PAYER_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function tokenSignature(WhitePayCheckout.Order memory order) internal returns (bytes memory) {
        bytes32 hash = keccak256(
            abi.encode(
                RECEIVE_TYPEHASH,
                payer,
                address(checkout),
                order.amount + order.fee,
                order.validAfter,
                order.validBefore,
                checkout.orderDigest(order)
            )
        );
        return sign(keccak256(abi.encodePacked(hex"1901", token.DOMAIN_SEPARATOR(), hash)));
    }

    function testOfficialTokenPositiveTransferAndReplayLocally() public {
        WhitePayCheckout.Order memory order = terms();
        bytes memory orderSig = sign(checkout.orderDigest(order));
        bytes memory tokenSig = tokenSignature(order);
        uint256 merchantBefore = token.balanceOf(merchant);
        uint256 feeBefore = token.balanceOf(treasury);
        vm.recordLogs();
        checkout.settle(order, orderSig, tokenSig);
        ForkVm.Log[] memory logs = vm.getRecordedLogs();
        uint256 found;
        for (uint256 i; i < logs.length; ++i) {
            if (
                logs[i].emitter == address(checkout)
                    && logs[i].topics[0]
                        == keccak256("PaymentSettled(bytes32,address,address,address,uint256,uint256,address,bytes32)")
            ) {
                ++found;
                require(logs[i].topics[1] == order.orderId, "event orderId");
                require(address(uint160(uint256(logs[i].topics[2]))) == payer, "event payer");
                require(address(uint160(uint256(logs[i].topics[3]))) == merchant, "event merchant");
                (address eventToken, uint256 amount, uint256 fee, address feeRecipient, bytes32 quoteId) =
                    abi.decode(logs[i].data, (address, uint256, uint256, address, bytes32));
                require(
                    eventToken == address(token) && amount == order.amount && fee == order.fee
                        && feeRecipient == treasury && quoteId == order.quoteId,
                    "event terms"
                );
            }
        }
        require(found == 1, "expected one settlement event");
        require(token.balanceOf(payer) == 14_995_000, "payer debit");
        require(token.balanceOf(merchant) == merchantBefore + order.amount, "merchant amount");
        require(token.balanceOf(treasury) == feeBefore + order.fee, "fee amount");
        require(token.balanceOf(address(checkout)) == 0, "residual");
        require(payer.balance == 0, "payer native changed");
        require(token.authorizationState(payer, checkout.orderDigest(order)), "nonce not consumed");
        vm.expectRevert(WhitePayCheckout.OrderAlreadySettled.selector);
        checkout.settle(order, orderSig, tokenSig);
        bytes32 consumedNonce = checkout.orderDigest(order);
        vm.prank(address(checkout));
        vm.expectRevert(bytes("TetherToken: auth invalid"));
        token.receiveWithAuthorization(
            payer,
            address(checkout),
            order.amount + order.fee,
            order.validAfter,
            order.validBefore,
            consumedNonce,
            tokenSig
        );
    }

    function testOfficialTokenThirdPartyCannotConsumeReceiveAuthorization() public {
        WhitePayCheckout.Order memory order = terms();
        bytes memory tokenSig = tokenSignature(order);
        bytes32 nonce = checkout.orderDigest(order);
        vm.expectRevert(bytes("TetherToken: to != msg.sender"));
        token.receiveWithAuthorization(
            payer, address(checkout), order.amount + order.fee, order.validAfter, order.validBefore, nonce, tokenSig
        );
        require(!token.authorizationState(payer, checkout.orderDigest(order)), "front-run consumed nonce");
        checkout.settle(order, sign(checkout.orderDigest(order)), tokenSig);
    }

    function testOfficialTokenTamperedTokenSignatureRejected() public {
        WhitePayCheckout.Order memory order = terms();
        bytes memory tokenSig = tokenSignature(order);
        order.fee += 1;
        bytes memory orderSig = sign(checkout.orderDigest(order));
        vm.expectRevert(bytes("TetherToken: invalid signature"));
        checkout.settle(order, orderSig, tokenSig);
        require(!checkout.settled(order.payer, order.orderId), "order marked settled");
    }

    function testOfficialTokenBlockedReceiverRollsBack() public {
        WhitePayCheckout.Order memory order = terms();
        bytes memory orderSig = sign(checkout.orderDigest(order));
        bytes memory tokenSig = tokenSignature(order);
        vm.prank(token.owner());
        token.addToBlockedList(address(checkout));
        vm.expectRevert(bytes("Blocked: msg.sender is blocked"));
        checkout.settle(order, orderSig, tokenSig);
        require(!checkout.settled(order.payer, order.orderId), "order consumed");
        require(token.balanceOf(payer) == 20_000_000, "payer debit after revert");
    }

    function testOfficialTokenFeePayoutFailureRollsBackMerchantAndNonce() public {
        WhitePayCheckout.Order memory order = terms();
        // Official token forbids transfers to its own address. Fail the second payout.
        order.feeRecipient = address(token);
        bytes memory orderSig = sign(checkout.orderDigest(order));
        bytes memory tokenSig = tokenSignature(order);
        bytes32 nonce = checkout.orderDigest(order);
        uint256 merchantBefore = token.balanceOf(merchant);
        vm.expectRevert(bytes("TetherToken: transfer to the contract address"));
        checkout.settle(order, orderSig, tokenSig);
        require(token.balanceOf(merchant) == merchantBefore, "partial merchant payout");
        require(token.balanceOf(payer) == 20_000_000, "payer funds not restored");
        require(token.balanceOf(address(checkout)) == 0, "receiver retained funds");
        require(!checkout.settled(order.payer, order.orderId), "order consumed after revert");
        require(!token.authorizationState(payer, nonce), "token nonce consumed after revert");
    }

    function testOfficialTokenInsufficientUSDTDoesNotSettle() public {
        WhitePayCheckout.Order memory order = terms();
        order.amount = 21_000_000;
        bytes memory orderSig = sign(checkout.orderDigest(order));
        bytes memory tokenSig = tokenSignature(order);
        bytes32 nonce = checkout.orderDigest(order);
        vm.expectRevert(bytes("ERC20: transfer amount exceeds balance"));
        checkout.settle(order, orderSig, tokenSig);
        require(!checkout.settled(order.payer, order.orderId), "order consumed");
        require(!token.authorizationState(payer, nonce), "nonce consumed");
    }

    function testReviewEveryMutableOrderFieldRejectsOriginalSignature() public {
        WhitePayCheckout.Order memory original = terms();
        bytes memory orderSig = sign(checkout.orderDigest(original));
        bytes memory tokenSig = tokenSignature(original);
        for (uint256 field; field < 9; ++field) {
            WhitePayCheckout.Order memory changed = terms();
            if (field == 0) changed.orderId = keccak256("changed order");
            if (field == 1) changed.payer = address(0xB10);
            if (field == 2) changed.merchant = address(0xB11);
            if (field == 3) changed.amount += 1;
            if (field == 4) changed.fee += 1;
            if (field == 5) changed.feeRecipient = address(0xB12);
            if (field == 6) changed.validAfter -= 1;
            if (field == 7) changed.validBefore += 1;
            if (field == 8) changed.quoteId = keccak256("changed quote");
            vm.expectRevert(WhitePayCheckout.InvalidOrderSignature.selector);
            checkout.settle(changed, orderSig, tokenSig);
            require(!checkout.settled(changed.payer, changed.orderId), "rejected order consumed");
        }
        require(token.balanceOf(payer) == 20_000_000, "tampering debited payer");
        require(!token.authorizationState(payer, checkout.orderDigest(original)), "original authorization consumed");
    }

    function testReviewZeroFeePaysMerchantWithoutResidual() public {
        WhitePayCheckout.Order memory order = terms();
        order.fee = 0;
        uint256 treasuryBefore = token.balanceOf(treasury);
        uint256 merchantBefore = token.balanceOf(merchant);
        checkout.settle(order, sign(checkout.orderDigest(order)), tokenSignature(order));
        require(token.balanceOf(payer) == 15_000_000, "payer debit");
        require(token.balanceOf(merchant) == merchantBefore + order.amount, "merchant credit");
        require(token.balanceOf(treasury) == treasuryBefore, "unexpected fee credit");
        require(token.balanceOf(address(checkout)) == 0, "receiver residual");
    }

    function testReviewMalformedSignatureDoesNotConsumeState() public {
        WhitePayCheckout.Order memory order = terms();
        bytes memory tokenSig = tokenSignature(order);
        vm.expectRevert();
        checkout.settle(order, hex"01", tokenSig);
        require(!checkout.settled(order.payer, order.orderId), "order consumed");
        require(!token.authorizationState(payer, checkout.orderDigest(order)), "nonce consumed");
        require(token.balanceOf(payer) == 20_000_000, "payer debited");
    }

    /// @dev A copied orderId with another payer must not block the victim's signed order.
    function testDifferentPayerCannotBlockSignedOrder() public {
        WhitePayCheckout.Order memory victimOrder = terms();
        bytes memory victimOrderSig = sign(checkout.orderDigest(victimOrder));
        bytes memory victimTokenSig = tokenSignature(victimOrder);
        uint256 attackerKey = 0xBAD123; // Public LOCAL FORK fixture only.
        address attacker = vm.addr(attackerKey);
        vm.prank(token.owner());
        token.mint(attacker, 1);

        WhitePayCheckout.Order memory attack = terms();
        attack.payer = attacker;
        attack.merchant = address(0xB21);
        attack.feeRecipient = address(0xB22);
        attack.amount = 1;
        attack.fee = 0;
        attack.quoteId = keccak256("attacker quote");
        bytes memory attackOrderSig = reviewSignWithKey(attackerKey, checkout.orderDigest(attack));
        bytes memory attackTokenSig = reviewTokenSignature(attack, attackerKey);
        vm.prank(attacker);
        checkout.settle(attack, attackOrderSig, attackTokenSig);

        require(checkout.settled(attacker, attack.orderId), "attacker order not recorded");
        require(!checkout.settled(payer, victimOrder.orderId), "attacker consumed victim order");
        checkout.settle(victimOrder, victimOrderSig, victimTokenSig);
        require(checkout.settled(payer, victimOrder.orderId), "victim order not recorded");
        require(token.balanceOf(payer) == 14_995_000, "victim payment did not complete");
        require(token.authorizationState(payer, checkout.orderDigest(victimOrder)), "victim authorization not consumed");
    }

    function testSamePayerCannotReuseOrderIdWithFreshSignaturesAndTerms() public {
        WhitePayCheckout.Order memory order = terms();
        checkout.settle(order, sign(checkout.orderDigest(order)), tokenSignature(order));
        order.quoteId = keccak256("fresh quote for same order");
        order.fee += 1;
        bytes32 freshNonce = checkout.orderDigest(order);
        bytes memory orderSig = sign(freshNonce);
        bytes memory tokenSig = tokenSignature(order);
        vm.expectRevert(WhitePayCheckout.OrderAlreadySettled.selector);
        checkout.settle(order, orderSig, tokenSig);
        require(token.balanceOf(payer) == 14_995_000, "payer debited twice");
        require(!token.authorizationState(payer, freshNonce), "fresh token nonce consumed");
    }

    function reviewSignWithKey(uint256 key, bytes32 digest) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function reviewTokenSignature(WhitePayCheckout.Order memory order, uint256 key) internal returns (bytes memory) {
        bytes32 receiveHash = keccak256(
            abi.encode(
                RECEIVE_TYPEHASH,
                order.payer,
                address(checkout),
                order.amount + order.fee,
                order.validAfter,
                order.validBefore,
                checkout.orderDigest(order)
            )
        );
        return reviewSignWithKey(key, keccak256(abi.encodePacked(hex"1901", token.DOMAIN_SEPARATOR(), receiveHash)));
    }
}
