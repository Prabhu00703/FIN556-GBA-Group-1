const { ethers } = require("hardhat");
const addresses = require("./addresses.json");

async function main() {
  console.log("🚀 Adding initial liquidity...");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);

  // Connect to token and WETH contracts
  const token = await ethers.getContractAt("DemoTokenPC", addresses.token);
  const weth = await ethers.getContractAt("WETH9", addresses.weth9);
  const factory = await ethers.getContractAt(
    "UniswapV2Factory",
    addresses.factory
  );

  // Check if Pair exists
  const pairAddress = await factory.getPair(
    await token.getAddress(),
    await weth.getAddress()
  );
  if (pairAddress === ethers.ZeroAddress) {
    console.error("❌ Error: Pair does not exist. Deploy the pair first.");
    return;
  }
  console.log("✅ Pair address:", pairAddress);

  // Approve tokens for router
  const router = await ethers.getContractAt(
    "UniswapV2Router02",
    addresses.router
  );

  const tokenAmount = ethers.parseUnits("100000", 18); // 100,000 tokens
  const ethAmount = ethers.parseUnits("0.1", 18); // ✅ 0.1 ETH (minimum requirement)

  console.log("Approving tokens for router...");
  let tx = await token.approve(addresses.router, tokenAmount);
  console.log("Approve TX Hash:", tx.hash);
  await tx.wait();
  console.log("✅ Token approved for router.");

  // Add liquidity (ETH will be sent as value)
  const block = await ethers.provider.getBlock();
  const deadline = block.timestamp + 600; // 10 min from now

  console.log("Adding liquidity to pool...");
  tx = await router.addLiquidityETH(
    token.getAddress(),
    tokenAmount,
    0, // min token
    0, // min ETH
    deployer.address,
    deadline,
    { value: ethAmount }
  );
  console.log("Add Liquidity TX Hash:", tx.hash);
  await tx.wait();
  console.log("✅ Liquidity added successfully.");

  // Check LP balance
  const pair = await ethers.getContractAt("UniswapV2Pair", pairAddress);
  const lpBalance = await pair.balanceOf(deployer.address);
  console.log(
    `LP Balance of ${deployer.address}:`,
    ethers.formatUnits(lpBalance, 18)
  );

  // Check reserves
  const reserves = await pair.getReserves();
  const [reserves0, reserves1] =
    (await token.getAddress()) < (await weth.getAddress())
      ? [reserves[0], reserves[1]]
      : [reserves[1], reserves[0]];

  console.log(
    `Reserves: ${ethers.formatUnits(
      reserves0,
      18
    )} ${await token.symbol()} / ${ethers.formatUnits(reserves1, 18)} WETH`
  );

  console.log("\n📋 --- Submission Info ---");
  console.log("Pair (Pool) Contract Address:", pairAddress);
  console.log("Token Approval TX:", tx.hash);
  console.log("Liquidity Addition TX:", tx.hash);
  console.log("Deployer LP Balance:", ethers.formatUnits(lpBalance, 18));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
