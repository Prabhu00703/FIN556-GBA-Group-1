// createPool.js
const { ethers } = require("hardhat");
const addresses = require("./addresses.json");

async function getPairAddress(token0, token1, factoryAddress) {
  let address0 = (await token0.getAddress()).toLowerCase();
  let address1 = (await token1.getAddress()).toLowerCase();

  if (address0 > address1) {
    [address0, address1] = [address1, address0];
  }

  // ✅ Your UniswapV2Pair init code hash
  const initCodeHash =
    "0x1445d203f13f60adfabc2036dbb0cd186371cf7ec9e16d576718b94109ab1991";

  const pairAddress2 = ethers.getCreate2Address(
    factoryAddress,
    ethers.keccak256(
      ethers.solidityPacked(["address", "address"], [address0, address1])
    ),
    initCodeHash
  );
  return pairAddress2;
}

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("👤 Signer:", await signer.getAddress());

  // Connect contracts
  const token = await ethers.getContractAt("DemoTokenPC", addresses.token);
  const weth = await ethers.getContractAt("WETH9", addresses.weth9);
  const factory = await ethers.getContractAt(
    "UniswapV2Factory",
    addresses.factory
  );

  console.log("\n🔍 Checking if pool exists...");
  let pairAddress1 = await factory.getPair(
    await token.getAddress(),
    await weth.getAddress()
  );

  if (pairAddress1 === ethers.ZeroAddress) {
    console.log("🧱 Pair does not exist — creating new pool...");
    const tx = await factory.createPair(
      await token.getAddress(),
      await weth.getAddress()
    );
    console.log("🪶 Pool Creation TX Hash:", tx.hash);
    await tx.wait();

    pairAddress1 = await factory.getPair(
      await token.getAddress(),
      await weth.getAddress()
    );
    console.log("✅ Pool created successfully!");
  } else {
    console.log("✅ Pair already exists.");
  }

  console.log(`\n📜 Pair Address (from factory): ${pairAddress1}`);

  const pairAddress2 = await getPairAddress(token, weth, addresses.factory);
  console.log(`📦 Pair Address (CREATE2 prediction): ${pairAddress2}`);

  console.log("\n📋 --- Submission Info ---");
  console.log("Pool Contract Address:", pairAddress1);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
