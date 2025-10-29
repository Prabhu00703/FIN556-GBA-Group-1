const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  // 1️⃣ Load the compiled UniswapV2Pair contract JSON
  const pairJsonPath = path.join(
    __dirname,
    "../artifacts/contracts/v2-core/UniswapV2Pair.sol/UniswapV2Pair.json"
  );
  const pairJson = JSON.parse(fs.readFileSync(pairJsonPath, "utf8"));

  // 2️⃣ Get the runtime bytecode and the constructor bytecode
  const bytecode = pairJson.bytecode;
  console.log("UniswapV2Pair bytecode length:", bytecode.length);

  // 3️⃣ Encode constructor arguments if needed (UniswapV2Pair has no constructor args)
  // So we can just use the bytecode as is
  const initCode = bytecode;

  // 4️⃣ Compute init code hash (used by UniswapV2Factory)
  const initCodeHash = ethers.keccak256(initCode);
  console.log("UniswapV2Pair init code hash:", initCodeHash);
}

main().catch(console.error);
