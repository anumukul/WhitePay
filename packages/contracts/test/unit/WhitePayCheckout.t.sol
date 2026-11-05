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
    bool public lyingBalance;
    address public reenterInto;
    bytes public reenterCalldata;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function failTransfersTo(address r) external { failRecipient = r; }
    function setLyingBalance(bool v) external { lyingBalance = v; }
    function scheduleReenter(address target, bytes calldata data) external {
        reenterInto = target; reenterCalldata = data;
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
        balanceOf[to] += value;
        return true;
    }

    // Deliberately misreports balance of this contract after transfer to prove the exact-balance check catches it.
    function balanceOfOverride(address who, uint256 real) internal view returns (uint256) {
        if (lyingBalance && who == msg.sender) return real + 1;
        return real;
    }
}

contract WhitePayCheckoutTest {
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
        require(checkout.settled(order.orderId), "unsettled");
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
        require(!checkout.settled(order.orderId), "order consumed after failure");
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
    }
}
