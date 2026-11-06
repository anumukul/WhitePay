// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Test-only helper: emits the exact PaymentSettled shape so off-chain indexer code can be
/// exercised without needing a full settle(). Never deployed to mainnet.
contract Emitter {
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

    function fire(
        bytes32 orderId,
        address payer,
        address merchant,
        address token,
        uint256 amount,
        uint256 fee,
        address feeRecipient,
        bytes32 quoteId
    ) external {
        emit PaymentSettled(orderId, payer, merchant, token, amount, fee, feeRecipient, quoteId);
    }
}
