// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {WhitePayCheckout} from "../../src/WhitePayCheckout.sol";

interface Vm {
    function chainId(uint256) external;
    function warp(uint256) external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function etch(address, bytes calldata) external;
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function expectEmit(bool, bool, bool, bool) external;
    function expectEmit(bool, bool, bool, bool, address) external;
    function recordLogs() external;
    function label(address, string calldata) external;
    function assume(bool) external;
}

/// Mock EIP-3009 token. Local-test fixture; not evidence of behavior on official Whitechain USDT.
contract MockReceiveAuthToken {
    string public constant name = "Mock";
    string public constant symbol = "MOCK";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    address public failRecipient;
    address public shortPayRecipient;
    address public reenterInto;
    bytes public reenterCalldata;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function failTransfersTo(address r) external {
        failRecipient = r;
    }

    function shortPay(address recipient) external {
        shortPayRecipient = recipient;
    }

    function scheduleReenter(address target, bytes calldata data) external {
        reenterInto = target;
        reenterCalldata = data;
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256,
        uint256,
        bytes32 nonce,
        bytes calldata
    ) external {
        require(msg.sender == to, "recipient only");
        require(!authorizationState[from][nonce], "nonce used");
        authorizationState[from][nonce] = true;
        require(balanceOf[from] >= value, "insufficient");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        if (reenterInto != address(0)) {
            (bool ok,) = reenterInto.call(reenterCalldata);
            require(ok, "reenter");
        }
    }

    function transfer(address to, uint256 value) external returns (bool) {
        if (to == failRecipient) return false;
        if (balanceOf[msg.sender] < value) return false;
        balanceOf[msg.sender] -= value;
        balanceOf[to] += to == shortPayRecipient && value > 0 ? value - 1 : value;
        return true;
    }
}

contract WhitePayCheckoutTest {
    event PaymentSettled(
        bytes32 indexed orderId,
        address indexed payer,
        address indexed merchant,
        address token,
        uint256 amount,
        uint256 fee,
        address feeRecipient,
        bytes32 quoteId
    );
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 constant CHAIN_ID = 1874;
    uint256 constant PAYER_KEY = 0xA11CE;
    uint256 constant OTHER_KEY = 0xB0B;

    address payer;
    address other;
    address merchant = address(0xB0B);
    address treasury = address(0xFEE);
    address relayer = address(0xCA11);

    MockReceiveAuthToken token;
    WhitePayCheckout checkout;

    function setUp() public {
        vm.chainId(CHAIN_ID);
        vm.warp(1_000);
        payer = vm.addr(PAYER_KEY);
        other = vm.addr(OTHER_KEY);
        token = new MockReceiveAuthToken();
        address[] memory allowed = new address[](1);
        allowed[0] = address(token);
        checkout = new WhitePayCheckout(CHAIN_ID, allowed);
        token.mint(payer, 1_000_000_000);
    }

    function baseOrder() internal view returns (WhitePayCheckout.Order memory) {
        return WhitePayCheckout.Order({
            orderId: keccak256("order-1"),
            payer: payer,
            merchant: merchant,
            amount: 5_000_000,
            fee: 5_000,
            feeRecipient: treasury,
            token: address(token),
            validAfter: 999,
            validBefore: 2_000,
            quoteId: keccak256("quote-1")
        });
    }

    function sign(uint256 pk, WhitePayCheckout.Order memory order) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, checkout.orderDigest(order));
        return abi.encodePacked(r, s, v);
    }

    // ───────────────────────── happy path ─────────────────────────

    function testExactAtomicSplit() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        vm.prank(relayer);
        checkout.settle(order, sig, hex"00");
        require(token.balanceOf(payer) == 1_000_000_000 - 5_005_000, "payer debit");
        require(token.balanceOf(merchant) == 5_000_000, "merchant credit");
        require(token.balanceOf(treasury) == 5_000, "fee credit");
        require(token.balanceOf(address(checkout)) == 0, "residual");
        require(checkout.settled(order.payer, order.orderId), "unsettled");
        require(token.authorizationState(payer, checkout.orderDigest(order)), "nonce not consumed");
    }

    function testZeroFeeNoFeeTransfer() public {
        WhitePayCheckout.Order memory order = baseOrder();
        order.fee = 0;
        bytes memory sig = sign(PAYER_KEY, order);
        checkout.settle(order, sig, hex"00");
        require(token.balanceOf(treasury) == 0, "fee moved");
        require(token.balanceOf(merchant) == 5_000_000, "merchant credit");
    }

    // ─────────────────────── replay/dedup ────────────────────────

    function testReplayRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        checkout.settle(order, sig, hex"00");
        vm.expectRevert(WhitePayCheckout.OrderAlreadySettled.selector);
        checkout.settle(order, sig, hex"00");
    }

    function testDifferentPayerCannotBlockSignedOrder() public {
        WhitePayCheckout.Order memory victim = baseOrder();
        bytes memory victimSig = sign(PAYER_KEY, victim);
        WhitePayCheckout.Order memory attack = baseOrder();
        attack.payer = other;
        attack.merchant = address(0xB21);
        attack.amount = 1;
        attack.fee = 0;
        token.mint(other, 1);
        bytes memory attackSig = sign(OTHER_KEY, attack);
        vm.prank(other);
        checkout.settle(attack, attackSig, hex"00");
        checkout.settle(victim, victimSig, hex"00");
        require(token.balanceOf(payer) == 994_995_000, "victim not paid");
        require(token.balanceOf(merchant) == 5_000_000, "merchant credit");
    }

    function testSamePayerCannotReuseOrderIdWithNewTerms() public {
        WhitePayCheckout.Order memory order = baseOrder();
        checkout.settle(order, sign(PAYER_KEY, order), hex"00");
        order.quoteId = keccak256("new quote");
        order.fee += 1;
        bytes32 freshNonce = checkout.orderDigest(order);
        bytes memory sig = sign(PAYER_KEY, order);
        vm.expectRevert(WhitePayCheckout.OrderAlreadySettled.selector);
        checkout.settle(order, sig, hex"00");
        require(!token.authorizationState(payer, freshNonce), "new nonce consumed");
        require(token.balanceOf(payer) == 994_995_000, "payer debited twice");
    }

    function testExactSettlementEvent() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        vm.expectEmit(true, true, true, true, address(checkout));
        emit PaymentSettled(
            order.orderId, payer, merchant, address(token), order.amount, order.fee, treasury, order.quoteId
        );
        checkout.settle(order, sig, hex"00");
    }

    function testAllRemainingSignedFieldsRejectTampering() public {
        bytes memory sig = sign(PAYER_KEY, baseOrder());
        for (uint256 field; field < 4; ++field) {
            WhitePayCheckout.Order memory changed = baseOrder();
            if (field == 0) changed.orderId = keccak256("different order");
            if (field == 1) changed.quoteId = keccak256("different quote");
            if (field == 2) changed.validAfter -= 1;
            if (field == 3) changed.validBefore += 1;
            vm.expectRevert(WhitePayCheckout.InvalidOrderSignature.selector);
            checkout.settle(changed, sig, hex"00");
            require(!checkout.settled(changed.payer, changed.orderId), "changed order consumed");
        }
    }

    function testAllowedTokenSubstitutionStillRejectsSignature() public {
        MockReceiveAuthToken second = new MockReceiveAuthToken();
        address[] memory allowed = new address[](2);
        allowed[0] = address(token);
        allowed[1] = address(second);
        checkout = new WhitePayCheckout(CHAIN_ID, allowed);
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        order.token = address(second);
        vm.expectRevert(WhitePayCheckout.InvalidOrderSignature.selector);
        checkout.settle(order, sig, hex"00");
    }

    function testShortMerchantTransferRollsBack() public {
        assertShortTransferRollsBack(merchant);
    }

    function testShortFeeTransferRollsBack() public {
        assertShortTransferRollsBack(treasury);
    }

    function assertShortTransferRollsBack(address recipient) internal {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        token.shortPay(recipient);
        vm.expectRevert(WhitePayCheckout.InexactTokenTransfer.selector);
        checkout.settle(order, sig, hex"00");
        require(token.balanceOf(payer) == 1_000_000_000, "payer not restored");
        require(token.balanceOf(merchant) == 0 && token.balanceOf(treasury) == 0, "partial payout");
        require(token.balanceOf(address(checkout)) == 0, "receiver residual");
        require(!checkout.settled(payer, order.orderId), "order consumed");
        require(!token.authorizationState(payer, checkout.orderDigest(order)), "token nonce consumed");
    }

    function testTotalOverflowDoesNotConsumeOrder() public {
        WhitePayCheckout.Order memory order = baseOrder();
        order.amount = type(uint256).max;
        order.fee = 1;
        bytes memory sig = sign(PAYER_KEY, order);
        vm.expectRevert(abi.encodeWithSignature("Panic(uint256)", uint256(0x11)));
        checkout.settle(order, sig, hex"00");
        require(!checkout.settled(payer, order.orderId), "overflow consumed order");
    }

    function testMalformedSignatureDoesNotConsumeOrder() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes32 nonce = checkout.orderDigest(order);
        vm.expectRevert();
        checkout.settle(order, hex"01", hex"00");
        require(!checkout.settled(payer, order.orderId), "order consumed");
        require(!token.authorizationState(payer, nonce), "token nonce consumed");
        require(token.balanceOf(payer) == 1_000_000_000, "payer debited");
    }

    function testInvalidWindowRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        order.validBefore = order.validAfter;
        vm.expectRevert(WhitePayCheckout.InvalidTerms.selector);
        checkout.settle(order, hex"00", hex"00");
    }

    function testInsufficientBalanceRollsBackAuthorization() public {
        WhitePayCheckout.Order memory order = baseOrder();
        order.amount = 1_000_000_001;
        bytes memory sig = sign(PAYER_KEY, order);
        bytes32 nonce = checkout.orderDigest(order);
        vm.expectRevert(bytes("insufficient"));
        checkout.settle(order, sig, hex"00");
        require(!checkout.settled(payer, order.orderId), "order consumed");
        require(!token.authorizationState(payer, nonce), "token nonce consumed");
    }

    function testDigestMatchesIndependentEIP712Encoding() public view {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("WhitePayCheckout"),
                keccak256("1"),
                CHAIN_ID,
                address(checkout)
            )
        );
        bytes32 typeHash = keccak256(
            "Order(bytes32 orderId,address payer,address merchant,uint256 amount,uint256 fee,address feeRecipient,address token,uint256 validAfter,uint256 validBefore,bytes32 quoteId)"
        );
        bytes32 structHash = keccak256(abi.encode(typeHash, order));
        require(
            checkout.orderDigest(order) == keccak256(abi.encodePacked(hex"1901", domain, structHash)),
            "digest encoding drift"
        );
    }

    function testInvalidRoleAndIdentifierCases() public {
        for (uint256 choice; choice < 10; ++choice) {
            WhitePayCheckout.Order memory order = baseOrder();
            if (choice == 0) order.orderId = bytes32(0);
            if (choice == 1) order.quoteId = bytes32(0);
            if (choice == 2) order.payer = address(0);
            if (choice == 3) order.merchant = address(0);
            if (choice == 4) order.feeRecipient = address(0);
            if (choice == 5) order.payer = address(checkout);
            if (choice == 6) order.merchant = address(checkout);
            if (choice == 7) order.feeRecipient = address(checkout);
            if (choice == 8) order.feeRecipient = order.merchant;
            if (choice == 9) order.feeRecipient = order.payer;
            vm.expectRevert(WhitePayCheckout.InvalidTerms.selector);
            checkout.settle(order, hex"00", hex"00");
        }
    }

    // ─────────────────────── tampering ───────────────────────────

    function testMerchantTamperRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        order.merchant = address(0xBAD);
        vm.expectRevert(WhitePayCheckout.InvalidOrderSignature.selector);
        checkout.settle(order, sig, hex"00");
    }

    function testFeeTamperRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        order.fee += 1;
        vm.expectRevert(WhitePayCheckout.InvalidOrderSignature.selector);
        checkout.settle(order, sig, hex"00");
    }

    function testAmountTamperRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        order.amount += 1;
        vm.expectRevert(WhitePayCheckout.InvalidOrderSignature.selector);
        checkout.settle(order, sig, hex"00");
    }

    function testFeeRecipientTamperRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        order.feeRecipient = address(0xBAD);
        vm.expectRevert(WhitePayCheckout.InvalidOrderSignature.selector);
        checkout.settle(order, sig, hex"00");
    }

    function testTokenTamperRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        MockReceiveAuthToken other2 = new MockReceiveAuthToken();
        // Not allowed anyway, but also sig mismatch — either reason is correct.
        order.token = address(other2);
        vm.expectRevert();
        checkout.settle(order, sig, hex"00");
    }

    // ─────────────────────── time window ─────────────────────────

    function testExpiredBoundaryRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        vm.warp(order.validBefore);
        vm.expectRevert(WhitePayCheckout.InvalidTimeWindow.selector);
        checkout.settle(order, sig, hex"00");
    }

    function testValidAfterBoundaryRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        vm.warp(order.validAfter);
        vm.expectRevert(WhitePayCheckout.InvalidTimeWindow.selector);
        checkout.settle(order, sig, hex"00");
    }

    // ─────────────────────── chain separation ────────────────────

    function testWrongRuntimeChainRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        vm.chainId(1);
        vm.expectRevert(WhitePayCheckout.WrongChain.selector);
        checkout.settle(order, sig, hex"00");
    }

    function testCrossContractSignatureRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        address[] memory allowed = new address[](1);
        allowed[0] = address(token);
        WhitePayCheckout other2 = new WhitePayCheckout(CHAIN_ID, allowed);
        vm.expectRevert(WhitePayCheckout.InvalidOrderSignature.selector);
        other2.settle(order, sig, hex"00");
    }

    function testWrongChainSignatureRejectedOnCorrectChain() public {
        WhitePayCheckout.Order memory order = baseOrder();
        vm.chainId(1);
        bytes memory wrongDomainSig = sign(PAYER_KEY, order);
        vm.chainId(CHAIN_ID);
        vm.expectRevert(WhitePayCheckout.InvalidOrderSignature.selector);
        checkout.settle(order, wrongDomainSig, hex"00");
    }

    // ─────────────────────── wrong signer ────────────────────────

    function testWrongSignerRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(OTHER_KEY, order);
        vm.expectRevert(WhitePayCheckout.InvalidOrderSignature.selector);
        checkout.settle(order, sig, hex"00");
    }

    function testFrontRunDifferentPayerRejected() public {
        // Attacker takes payer's signed order and swaps in their own payer address — digest changes, sig invalid.
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        order.payer = other;
        vm.expectRevert(WhitePayCheckout.InvalidOrderSignature.selector);
        checkout.settle(order, sig, hex"00");
    }

    // ─────────────────────── terms validation ────────────────────

    function testZeroAmountRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        order.amount = 0;
        bytes memory sig = sign(PAYER_KEY, order);
        vm.expectRevert(WhitePayCheckout.InvalidTerms.selector);
        checkout.settle(order, sig, hex"00");
    }

    function testPayerEqualsMerchantRejected() public {
        WhitePayCheckout.Order memory order = baseOrder();
        order.merchant = order.payer;
        bytes memory sig = sign(PAYER_KEY, order);
        vm.expectRevert(WhitePayCheckout.InvalidTerms.selector);
        checkout.settle(order, sig, hex"00");
    }

    function testDisallowedTokenRejected() public {
        MockReceiveAuthToken rogue = new MockReceiveAuthToken();
        WhitePayCheckout.Order memory order = baseOrder();
        order.token = address(rogue);
        bytes memory sig = sign(PAYER_KEY, order);
        vm.expectRevert(WhitePayCheckout.TokenNotAllowed.selector);
        checkout.settle(order, sig, hex"00");
    }

    // ─────────────────── malicious ERC20 behavior ────────────────

    function testFeeTransferFailureRollsBack() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        token.failTransfersTo(treasury);
        vm.expectRevert();
        checkout.settle(order, sig, hex"00");
        require(token.balanceOf(payer) == 1_000_000_000, "payer not restored");
        require(token.balanceOf(merchant) == 0, "partial merchant payout");
        require(!checkout.settled(order.payer, order.orderId), "order consumed after failure");
        require(!token.authorizationState(payer, checkout.orderDigest(order)), "nonce consumed after failure");
    }

    function testReentryBlocked() public {
        WhitePayCheckout.Order memory order = baseOrder();
        bytes memory sig = sign(PAYER_KEY, order);
        // Schedule a reentrant call back into checkout.settle with the same order during receive.
        token.scheduleReenter(address(checkout), abi.encodeWithSelector(checkout.settle.selector, order, sig, hex"00"));
        vm.expectRevert();
        checkout.settle(order, sig, hex"00");
    }

    // ─────────────────────── fuzz ────────────────────────────────

    function testFuzzPayerReplayIsolation(bytes32 id, uint64 payment) public {
        if (id == bytes32(0)) id = bytes32(uint256(1));
        WhitePayCheckout.Order memory victim = baseOrder();
        victim.orderId = id;
        victim.amount = uint256(payment) % 500_000_000 + 1;
        victim.fee = 0;
        WhitePayCheckout.Order memory attack = baseOrder();
        attack.orderId = id;
        attack.payer = other;
        attack.merchant = address(0xB21);
        attack.amount = 1;
        attack.fee = 0;
        token.mint(other, 1);
        checkout.settle(attack, sign(OTHER_KEY, attack), hex"00");
        bytes memory sig = sign(PAYER_KEY, victim);
        checkout.settle(victim, sig, hex"00");
        require(checkout.settled(payer, id) && checkout.settled(other, id), "payer isolation");
        require(token.balanceOf(merchant) == victim.amount, "merchant credit");
        vm.expectRevert(WhitePayCheckout.OrderAlreadySettled.selector);
        checkout.settle(victim, sig, hex"00");
    }

    function testFuzzExactMathHolds(uint64 amount, uint64 fee) public {
        vm.assume(amount > 0 && amount < 500_000_000);
        vm.assume(fee < 500_000_000);
        uint256 total = uint256(amount) + uint256(fee);
        token.mint(payer, total);
        WhitePayCheckout.Order memory order = baseOrder();
        order.orderId = keccak256(abi.encodePacked("fuzz", amount, fee));
        order.amount = amount;
        order.fee = fee;
        bytes memory sig = sign(PAYER_KEY, order);
        uint256 payerBefore = token.balanceOf(payer);
        uint256 merchantBefore = token.balanceOf(merchant);
        uint256 feeBefore = token.balanceOf(treasury);
        checkout.settle(order, sig, hex"00");
        require(token.balanceOf(payer) == payerBefore - total, "payer");
        require(token.balanceOf(merchant) == merchantBefore + amount, "merchant");
        require(token.balanceOf(treasury) == feeBefore + fee, "fee");
        require(token.balanceOf(address(checkout)) == 0, "receiver residual");
        require(checkout.settled(payer, order.orderId), "not settled");
        require(token.authorizationState(payer, checkout.orderDigest(order)), "nonce not consumed");
        vm.expectRevert(WhitePayCheckout.OrderAlreadySettled.selector);
        checkout.settle(order, sig, hex"00");
    }
}
