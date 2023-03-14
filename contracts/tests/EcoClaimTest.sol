// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../EcoClaim.sol";

contract EcoClaimTest is EcoClaim {
    event ClaimTest();

    function log() external {
        emit ClaimTest();
    }
}
