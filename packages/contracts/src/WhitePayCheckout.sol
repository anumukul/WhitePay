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

/// @title WhitePayCheckout
/// @notice Production checkout settling buyer payments atomically in a permitted ERC-20 token
///         (EIP-3009 `receiveWithAuthorization`), splitting between merchant and fee recipient.
///         Matches the authorization path proven in WhitePayAuthorizationPoC (ADR 0001 path A).
///         No funds custodied — all transfers occur within a single call.
contract WhitePayCheckout is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Expected chain id; immutable so cross-chain replay reverts even if runtime chain is spoofed.
    uint256 public immutable expectedChainId;

    /// @dev Only tokens explicitly allowed by the deployer may be used. Prevents abuse with arbitrary
    ///      tokens whose receiveWithAuthorization may not conform to EIP-3009 semantics.
    mapping(address => bool) public tokenAllowed;

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
        address token;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 quoteId;
    }

    mapping(bytes32 => bool) public settled;

    error WrongChain();
    error TokenNotAllowed();
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
        address feeRecipient,
        bytes32 quoteId
    );
    event TokenAllowanceSet(address indexed token, bool allowed);

    constructor(uint256 _expectedChainId, address[] memory allowedTokens)
        EIP712("WhitePayCheckout", "1")
    {
        if (block.chainid != _expectedChainId) revert WrongChain();
        expectedChainId = _expectedChainId;
        for (uint256 i = 0; i < allowedTokens.length; i++) {
            if (allowedTokens[i] == address(0)) revert InvalidTerms();
            tokenAllowed[allowedTokens[i]] = true;
            emit TokenAllowanceSet(allowedTokens[i], true);
        }
    }

    /// @notice The EIP-712 digest. Also used as the token's one-time authorization nonce.
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
                    order.token,
                    order.validAfter,
                    order.validBefore,
                    order.quoteId
                )
            )
        );
    }

    /// @notice Settle an order atomically. Any failure reverts all effects.
    function settle(Order calldata order, bytes calldata orderSignature, bytes calldata tokenSignature)
        external
        nonReentrant
    {
        if (block.chainid != expectedChainId) revert WrongChain();
        if (!tokenAllowed[order.token]) revert TokenNotAllowed();
        if (settled[order.orderId]) revert OrderAlreadySettled();
        _validateTerms(order);
        if (block.timestamp <= order.validAfter || block.timestamp >= order.validBefore) {
            revert InvalidTimeWindow();
        }

        bytes32 digest = orderDigest(order);
        if (ECDSA.recover(digest, orderSignature) != order.payer) revert InvalidOrderSignature();

        uint256 total = order.amount + order.fee;
        IERC20 token = IERC20(order.token);
        uint256 payerBefore = token.balanceOf(order.payer);
        uint256 merchantBefore = token.balanceOf(order.merchant);
        uint256 feeBefore = token.balanceOf(order.feeRecipient);
        uint256 selfBefore = token.balanceOf(address(this));

        settled[order.orderId] = true;

        IReceiveAuthorization(order.token).receiveWithAuthorization(
            order.payer, address(this), total, order.validAfter, order.validBefore, digest, tokenSignature
        );
        token.safeTransfer(order.merchant, order.amount);
        if (order.fee != 0) token.safeTransfer(order.feeRecipient, order.fee);

        if (
            token.balanceOf(order.payer) != payerBefore - total
                || token.balanceOf(order.merchant) != merchantBefore + order.amount
                || token.balanceOf(order.feeRecipient) != feeBefore + order.fee
                || token.balanceOf(address(this)) != selfBefore
        ) revert InexactTokenTransfer();

        emit PaymentSettled(
            order.orderId,
            order.payer,
            order.merchant,
            order.token,
            order.amount,
            order.fee,
            order.feeRecipient,
            order.quoteId
        );
    }

    function _validateTerms(Order calldata order) internal view {
        if (
            order.orderId == bytes32(0)
                || order.quoteId == bytes32(0)
                || order.amount == 0
                || order.payer == address(0)
                || order.merchant == address(0)
                || order.feeRecipient == address(0)
                || order.payer == order.merchant
                || order.payer == order.feeRecipient
                || order.merchant == order.feeRecipient
                || order.payer == address(this)
                || order.merchant == address(this)
                || order.feeRecipient == address(this)
                || order.validBefore <= order.validAfter
        ) revert InvalidTerms();
    }
}
