// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * Helper interface for the eco currency
 */
interface IECO is IERC20Upgradeable {
    function getPastLinearInflation(uint256 blockNumber)
        external
        view
        returns (uint256);
}
