// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {WhitePayCheckout} from "../src/WhitePayCheckout.sol";

interface IVmScript {
    function envUint(string calldata) external view returns (uint256);
    function envAddress(string calldata) external view returns (address);
    function envOr(string calldata, uint256) external view returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
    function startBroadcast(uint256) external;
    function broadcast() external;
    function recordLogs() external;
}

/// @notice Step 04 deploy script for WhitePayCheckout.
///         Intended invocation:
///
///           forge script script/DeployWhitePayCheckout.s.sol \
///             --rpc-url $WHITECHAIN_RPC_URL --sender $DEPLOYER \
///             --keystore $DEPLOYER_KEYSTORE --broadcast --verify \
///             --verifier blockscout \
///             --verifier-url https://sepolia.whitechain.io/api/
///
///         Without --broadcast this runs as a dry-run in a local EVM.
///         Required env vars:
///           EXPECTED_CHAIN_ID       — 1874 for Whitechain Sepolia
///           WHITECHAIN_USDT_ADDRESS — the single allowed token (ADR 0001)
contract DeployWhitePayCheckout {
    IVmScript constant vm = IVmScript(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (WhitePayCheckout checkout, address[] memory tokens) {
        uint256 expectedChainId = vm.envUint("EXPECTED_CHAIN_ID");
        address usdt = vm.envAddress("WHITECHAIN_USDT_ADDRESS");
        validateDeploymentInputs(expectedChainId, usdt);

        tokens = new address[](1);
        tokens[0] = usdt;

        vm.startBroadcast();
        checkout = new WhitePayCheckout(expectedChainId, tokens);
        vm.stopBroadcast();
    }

    /// @notice Deployment-tool guard, not an additional function on WhitePayCheckout.
    function validateDeploymentInputs(uint256 expectedChainId, address usdt) public pure {
        require(expectedChainId == 1874, "Expected Whitechain Sepolia chain 1874");
        require(usdt == 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7, "Expected official Whitechain Sepolia USDT");
    }
}
