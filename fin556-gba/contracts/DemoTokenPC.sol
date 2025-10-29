// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./OwnableMintableERC20.sol";

contract DemoTokenPC is OwnableMintableERC20 {
    constructor() OwnableMintableERC20("DEMOTOKEN-PC", "DEMOTOKEN-PC") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }
}
