// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract EcoXTest is ERC20Upgradeable {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 amount
    ) {
        ERC20Upgradeable.__ERC20_init(name_, symbol_);
        _mint(msg.sender, amount * 1 ether);
    }
}
