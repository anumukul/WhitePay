// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IReceiveAuthorization {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;
}

/// @notice EXPERIMENTAL Step 02 proof only. Not the final checkout implementation.
/// @dev EOA payer only. Two signatures: typed order plus token receive authorization.
contract WhitePayAuthorizationPoC is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant TOKEN = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;
    uint256 public constant CHAIN_ID = 1874;
    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(bytes32 orderId,address payer,address merchant,uint256 amount,uint256 fee,address feeRecipient,address token,uint256 validAfter,uint256 validBefore,bytes32 quoteId)"
    );

    struct Order {
        bytes32 orderId;
        address payer;
        address merchant;
        uint256 amount;
        uint256 fee;
        address feeRecipient;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 quoteId;
    }

    struct Balances {
        uint256 payer;
        uint256 merchant;
        uint256 fee;
        uint256 receiver;
    }

    mapping(bytes32 => bool) public settled;

    error WrongChain();
    error MissingTokenCode();
    error InvalidTerms();
    error InvalidTimeWindow();
    error InvalidOrderSignature();
    error OrderAlreadySettled();
    error InexactTokenTransfer();

    event PaymentSettled(
        bytes32 indexed orderId,
        address indexed payer,
        address indexed merchant,
        address token,
        uint256 amount,
        uint256 fee,
        address feeRecipient
    );

    constructor() EIP712("WhitePayAuthorizationPoC", "1") {
        if (block.chainid != CHAIN_ID) revert WrongChain();
        if (TOKEN.code.length == 0) revert MissingTokenCode();
    }

    /// @notice This digest is also the token's one-time bytes32 authorization nonce.
    function orderDigest(Order calldata order) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH,
                    order.orderId,
                    order.payer,
                    order.merchant,
                    order.amount,
                    order.fee,
                    order.feeRecipient,
                    TOKEN,
                    order.validAfter,
                    order.validBefore,
                    order.quoteId
                )
            )
        );
    }

    function settle(Order calldata order, bytes calldata orderSignature, bytes calldata tokenSignature)
        external
        nonReentrant
    {
        if (block.chainid != CHAIN_ID) revert WrongChain();
        if (settled[order.orderId]) revert OrderAlreadySettled();
        if (
            order.orderId == bytes32(0) || order.quoteId == bytes32(0) || order.amount == 0 || order.payer == address(0)
                || order.merchant == address(0) || order.feeRecipient == address(0) || order.payer == order.merchant
                || order.payer == order.feeRecipient || order.merchant == order.feeRecipient
                || order.payer == address(this) || order.merchant == address(this)
                || order.feeRecipient == address(this)
        ) revert InvalidTerms();
        if (block.timestamp <= order.validAfter || block.timestamp >= order.validBefore) {
            revert InvalidTimeWindow();
        }
        bytes32 digest = orderDigest(order);
        if (ECDSA.recover(digest, orderSignature) != order.payer) revert InvalidOrderSignature();
        uint256 total = order.amount + order.fee;
        IERC20 token = IERC20(TOKEN);
        Balances memory beforeBalances = Balances(
            token.balanceOf(order.payer),
            token.balanceOf(order.merchant),
            token.balanceOf(order.feeRecipient),
            token.balanceOf(address(this))
        );

        settled[order.orderId] = true;
        IReceiveAuthorization(TOKEN)
            .receiveWithAuthorization(
                order.payer, address(this), total, order.validAfter, order.validBefore, digest, tokenSignature
            );
        token.safeTransfer(order.merchant, order.amount);
        if (order.fee != 0) token.safeTransfer(order.feeRecipient, order.fee);
        if (
            token.balanceOf(order.payer) != beforeBalances.payer - total
                || token.balanceOf(order.merchant) != beforeBalances.merchant + order.amount
                || token.balanceOf(order.feeRecipient) != beforeBalances.fee + order.fee
                || token.balanceOf(address(this)) != beforeBalances.receiver
        ) revert InexactTokenTransfer();
        emit PaymentSettled(
            order.orderId, order.payer, order.merchant, TOKEN, order.amount, order.fee, order.feeRecipient
        );
    }
}
