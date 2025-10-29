pragma solidity 0.5.16;

import "./v2-core/UniswapV2Pair.sol";

contract GetInitCodeHash {
    function getInitCodeHash() public pure returns (bytes32) {
        bytes memory bytecode = type(UniswapV2Pair).creationCode;
        return keccak256(bytecode);
    }
}
