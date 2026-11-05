// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {WhitePayAuthorizationPoC} from "../../poc/WhitePayAuthorizationPoC.sol";

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
}

// Intentionally incomplete token model: local tests are never live Whitechain evidence.
contract AuthorizationTokenMock {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    address public failRecipient;

    function mint(address payer, uint256 amount) external {
        balanceOf[payer] += amount;
    }

    function failTransfersTo(address recipient) external {
        failRecipient = recipient;
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
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        if (to == failRecipient) return false;
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        return true;
    }
}

contract AuthorizationPoCTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant TOKEN = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;
    uint256 constant PAYER_KEY = 0xA11CE; // Public local-test fixture, never a funded wallet.
    address payer;
    address merchant = address(0xB0B);
    address treasury = address(0xFEE);
    address relayer = address(0xCA11);
    AuthorizationTokenMock token;
    WhitePayAuthorizationPoC poc;

    function setUp() public {
        vm.chainId(1874);
        vm.warp(1_000);
        payer = vm.addr(PAYER_KEY);
        AuthorizationTokenMock model = new AuthorizationTokenMock();
        vm.etch(TOKEN, address(model).code);
        token = AuthorizationTokenMock(TOKEN);
        token.mint(payer, 20_000_000);
        poc = new WhitePayAuthorizationPoC();
    }

    function terms() internal view returns (WhitePayAuthorizationPoC.Order memory) {
        return WhitePayAuthorizationPoC.Order({
            orderId: keccak256("order-1"),
            payer: payer,
            merchant: merchant,
            amount: 5_000_000,
            fee: 5_000,
            feeRecipient: treasury,
            validAfter: 999,
            validBefore: 2_000,
            quoteId: keccak256("quote-1")
        });
    }

    function signature(WhitePayAuthorizationPoC.Order memory order) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PAYER_KEY, poc.orderDigest(order));
        return abi.encodePacked(r, s, v);
    }

    function testOrderDigestMatchesOffchainVector() public {
        address receiver = 0x1000000000000000000000000000000000000006;
        vm.etch(receiver, address(poc).code);
        bytes32 digest = WhitePayAuthorizationPoC(receiver).orderDigest(terms());
        require(digest == 0x6f4080181e88418d124d4ec129901c4e8644582ccbdf67ac25b1d02d560d67b6, "offchain digest differs");
    }

    function testExactAtomicSplitWithZeroWBTPayer() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        bytes memory sig = signature(order);
        vm.prank(relayer);
        poc.settle(order, sig, hex"00");
        require(payer.balance == 0, "payer WBT changed");
        require(token.balanceOf(payer) == 14_995_000, "payer debit");
        require(token.balanceOf(merchant) == 5_000_000, "merchant credit");
        require(token.balanceOf(treasury) == 5_000, "fee credit");
        require(token.balanceOf(address(poc)) == 0, "residual token balance");
        require(poc.settled(order.orderId), "unsettled");
        require(token.authorizationState(payer, poc.orderDigest(order)), "wrong token nonce");
    }

    function testDuplicateOrderRejectedForIntendedReason() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        bytes memory sig = signature(order);
        poc.settle(order, sig, hex"00");
        vm.expectRevert(WhitePayAuthorizationPoC.OrderAlreadySettled.selector);
        poc.settle(order, sig, hex"00");
    }

    function testMerchantTamperingRejected() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        bytes memory sig = signature(order);
        order.merchant = address(0xBAD);
        vm.expectRevert(WhitePayAuthorizationPoC.InvalidOrderSignature.selector);
        poc.settle(order, sig, hex"00");
    }

    function testFeeTamperingRejected() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        bytes memory sig = signature(order);
        order.fee += 1;
        vm.expectRevert(WhitePayAuthorizationPoC.InvalidOrderSignature.selector);
        poc.settle(order, sig, hex"00");
    }

    function testFeeTransferFailureRollsBackAllEffects() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        bytes memory sig = signature(order);
        token.failTransfersTo(treasury);
        vm.expectRevert();
        poc.settle(order, sig, hex"00");
        require(token.balanceOf(payer) == 20_000_000, "payer not restored");
        require(token.balanceOf(merchant) == 0, "partial merchant payout");
        require(!poc.settled(order.orderId), "order consumed after failure");
        require(!token.authorizationState(payer, poc.orderDigest(order)), "nonce consumed after failure");
    }

    function testExpirationExactBoundaryRejected() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        bytes memory sig = signature(order);
        vm.warp(order.validBefore);
        vm.expectRevert(WhitePayAuthorizationPoC.InvalidTimeWindow.selector);
        poc.settle(order, sig, hex"00");
    }

    function testValidAfterExactBoundaryRejected() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        bytes memory sig = signature(order);
        vm.warp(order.validAfter);
        vm.expectRevert(WhitePayAuthorizationPoC.InvalidTimeWindow.selector);
        poc.settle(order, sig, hex"00");
    }

    function testWrongRuntimeChainRejected() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        bytes memory sig = signature(order);
        vm.chainId(1);
        vm.expectRevert(WhitePayAuthorizationPoC.WrongChain.selector);
        poc.settle(order, sig, hex"00");
    }

    function testCrossContractSignatureRejected() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        bytes memory sig = signature(order);
        WhitePayAuthorizationPoC other = new WhitePayAuthorizationPoC();
        vm.expectRevert(WhitePayAuthorizationPoC.InvalidOrderSignature.selector);
        other.settle(order, sig, hex"00");
    }
}
