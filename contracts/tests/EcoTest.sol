// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "../interfaces/IECO.sol";

contract EcoTest is ERC20Upgradeable, IECO {
    uint256 public inflation;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 amount
    ) {
        ERC20Upgradeable.__ERC20_init(name_, symbol_);
        _mint(msg.sender, amount * 1 ether);
        inflation = 100;
    }

    function getPastLinearInflation(uint256 blockNumber)
        external
        view
        returns (uint256)
    {
        blockNumber += blockNumber; //turn off no-unused-vars
        return inflation;
    }

    function updateInflation(uint256 newInflation) public {
        inflation = newInflation;
    }
}
