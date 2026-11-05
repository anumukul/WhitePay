// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {WhitePayAuthorizationPoC} from "../../poc/WhitePayAuthorizationPoC.sol";

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
contract OfficialTokenForkTest {
    ForkVm constant vm = ForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    OfficialToken constant token = OfficialToken(0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7);
    uint256 constant PAYER_KEY = 0xF012345; // Public fork fixture, never fund on any network.
    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    address payer;
    address merchant = address(0xA01);
    address treasury = address(0xA02);
    WhitePayAuthorizationPoC poc;

    function setUp() public {
        require(block.chainid == 1874, "Run only with Whitechain Sepolia --fork-url");
        require(address(token).code.length > 0, "Missing official token; fork required");
        payer = vm.addr(PAYER_KEY);
        require(payer.balance == 0, "fork payer native balance must be zero");
        require(token.balanceOf(payer) == 0, "fork payer must start empty");
        vm.prank(token.owner());
        token.mint(payer, 20_000_000);
        poc = new WhitePayAuthorizationPoC();
    }

    function terms() internal view returns (WhitePayAuthorizationPoC.Order memory) {
        return WhitePayAuthorizationPoC.Order({
            orderId: keccak256("fork-order"),
            payer: payer,
            merchant: merchant,
            amount: 5_000_000,
            fee: 5_000,
            feeRecipient: treasury,
            validAfter: block.timestamp - 1,
            validBefore: block.timestamp + 3600,
            quoteId: keccak256("fork-quote")
        });
    }

    function sign(bytes32 digest) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PAYER_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function tokenSignature(WhitePayAuthorizationPoC.Order memory order) internal returns (bytes memory) {
        bytes32 hash = keccak256(
            abi.encode(
                RECEIVE_TYPEHASH,
                payer,
                address(poc),
                order.amount + order.fee,
                order.validAfter,
                order.validBefore,
                poc.orderDigest(order)
            )
        );
        return sign(keccak256(abi.encodePacked(hex"1901", token.DOMAIN_SEPARATOR(), hash)));
    }

    function testOfficialTokenPositiveTransferAndReplayLocally() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        bytes memory orderSig = sign(poc.orderDigest(order));
        bytes memory tokenSig = tokenSignature(order);
        uint256 merchantBefore = token.balanceOf(merchant);
        uint256 feeBefore = token.balanceOf(treasury);
        vm.recordLogs();
        poc.settle(order, orderSig, tokenSig);
        ForkVm.Log[] memory logs = vm.getRecordedLogs();
        uint256 found;
        for (uint256 i; i < logs.length; ++i) {
            if (
                logs[i].emitter == address(poc)
                    && logs[i].topics[0]
                        == keccak256("PaymentSettled(bytes32,address,address,address,uint256,uint256,address)")
            ) {
                ++found;
                require(logs[i].topics[1] == order.orderId, "event orderId");
                require(address(uint160(uint256(logs[i].topics[2]))) == payer, "event payer");
                require(address(uint160(uint256(logs[i].topics[3]))) == merchant, "event merchant");
                (address eventToken, uint256 amount, uint256 fee, address feeRecipient) =
                    abi.decode(logs[i].data, (address, uint256, uint256, address));
                require(
                    eventToken == address(token) && amount == order.amount && fee == order.fee
                        && feeRecipient == treasury,
                    "event terms"
                );
            }
        }
        require(found == 1, "expected one settlement event");
        require(token.balanceOf(payer) == 14_995_000, "payer debit");
        require(token.balanceOf(merchant) == merchantBefore + order.amount, "merchant amount");
        require(token.balanceOf(treasury) == feeBefore + order.fee, "fee amount");
        require(token.balanceOf(address(poc)) == 0, "residual");
        require(payer.balance == 0, "payer native changed");
        require(token.authorizationState(payer, poc.orderDigest(order)), "nonce not consumed");
        vm.expectRevert(WhitePayAuthorizationPoC.OrderAlreadySettled.selector);
        poc.settle(order, orderSig, tokenSig);
        bytes32 consumedNonce = poc.orderDigest(order);
        vm.prank(address(poc));
        vm.expectRevert(bytes("TetherToken: auth invalid"));
        token.receiveWithAuthorization(
            payer, address(poc), order.amount + order.fee, order.validAfter, order.validBefore, consumedNonce, tokenSig
        );
    }

    function testOfficialTokenThirdPartyCannotConsumeReceiveAuthorization() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        bytes memory tokenSig = tokenSignature(order);
        bytes32 nonce = poc.orderDigest(order);
        vm.expectRevert(bytes("TetherToken: to != msg.sender"));
        token.receiveWithAuthorization(
            payer, address(poc), order.amount + order.fee, order.validAfter, order.validBefore, nonce, tokenSig
        );
        require(!token.authorizationState(payer, poc.orderDigest(order)), "front-run consumed nonce");
        poc.settle(order, sign(poc.orderDigest(order)), tokenSig);
    }

    function testOfficialTokenTamperedTokenSignatureRejected() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        bytes memory tokenSig = tokenSignature(order);
        order.fee += 1;
        bytes memory orderSig = sign(poc.orderDigest(order));
        vm.expectRevert(bytes("TetherToken: invalid signature"));
        poc.settle(order, orderSig, tokenSig);
        require(!poc.settled(order.orderId), "order marked settled");
    }

    function testOfficialTokenBlockedReceiverRollsBack() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        bytes memory orderSig = sign(poc.orderDigest(order));
        bytes memory tokenSig = tokenSignature(order);
        vm.prank(token.owner());
        token.addToBlockedList(address(poc));
        vm.expectRevert(bytes("Blocked: msg.sender is blocked"));
        poc.settle(order, orderSig, tokenSig);
        require(!poc.settled(order.orderId), "order consumed");
        require(token.balanceOf(payer) == 20_000_000, "payer debit after revert");
    }

    function testOfficialTokenFeePayoutFailureRollsBackMerchantAndNonce() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        // Official token forbids transfers to its own address. Fail the second payout.
        order.feeRecipient = address(token);
        bytes memory orderSig = sign(poc.orderDigest(order));
        bytes memory tokenSig = tokenSignature(order);
        bytes32 nonce = poc.orderDigest(order);
        uint256 merchantBefore = token.balanceOf(merchant);
        vm.expectRevert(bytes("TetherToken: transfer to the contract address"));
        poc.settle(order, orderSig, tokenSig);
        require(token.balanceOf(merchant) == merchantBefore, "partial merchant payout");
        require(token.balanceOf(payer) == 20_000_000, "payer funds not restored");
        require(token.balanceOf(address(poc)) == 0, "receiver retained funds");
        require(!poc.settled(order.orderId), "order consumed after revert");
        require(!token.authorizationState(payer, nonce), "token nonce consumed after revert");
    }

    function testOfficialTokenInsufficientUSDTDoesNotSettle() public {
        WhitePayAuthorizationPoC.Order memory order = terms();
        order.amount = 21_000_000;
        bytes memory orderSig = sign(poc.orderDigest(order));
        bytes memory tokenSig = tokenSignature(order);
        bytes32 nonce = poc.orderDigest(order);
        vm.expectRevert(bytes("ERC20: transfer amount exceeds balance"));
        poc.settle(order, orderSig, tokenSig);
        require(!poc.settled(order.orderId), "order consumed");
        require(!token.authorizationState(payer, nonce), "nonce consumed");
    }
}
