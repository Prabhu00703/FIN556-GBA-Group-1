const { ethers } = require("hardhat");
const addresses = require("./addresses.json");

async function main() {
  console.log("🚀 Adding liquidity to UniswapV2 (Hoodi)...");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const token = await ethers.getContractAt("DemoTokenPC", addresses.token);
  const weth = await ethers.getContractAt("WETH9", addresses.weth9);
  const factory = await ethers.getContractAt(
    "UniswapV2Factory",
    addresses.factory
  );
  const router = await ethers.getContractAt(
    "UniswapV2Router02",
    addresses.router
  );

  console.log("Router factory:", await router.factory());
  console.log("Your factory:", addresses.factory);

  const pairAddress = await factory.getPair(
    await token.getAddress(),
    await weth.getAddress()
  );
  if (pairAddress === ethers.ZeroAddress) {
    throw new Error("❌ Pair does not exist — create it first.");
  }
  console.log("✅ Pair address:", pairAddress);

  const tokenAmount = ethers.parseUnits("100000", 18);
  const ethAmount = ethers.parseUnits("0.1", 18);

  // 1️⃣ Check deployer balance
  const bal = await token.balanceOf(deployer.address);
  console.log("Token balance:", ethers.formatUnits(bal, 18));

  // 2️⃣ Approve router
  console.log("Approving router...");
  const tx = await token.approve(addresses.router, tokenAmount);
  console.log("Approve TX:", tx.hash);
  await tx.wait();

  // 3️⃣ Verify allowance
  const allowance = await token.allowance(deployer.address, addresses.router);
  console.log("Allowance after approval:", ethers.formatUnits(allowance, 18));
  if (allowance < tokenAmount) throw new Error("❌ Approval failed!");

  // 4️⃣ Add liquidity
  const block = await ethers.provider.getBlock("latest");
  const deadline = block.timestamp + 600;

  console.log("Adding liquidity...");
  const addTx = await router.addLiquidityETH(
    token.getAddress(),
    tokenAmount,
    0,
    0,
    deployer.address,
    deadline,
    { value: ethAmount }
  );
  console.log("Liquidity TX:", addTx.hash);
  await addTx.wait();

  console.log("✅ Liquidity added successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
