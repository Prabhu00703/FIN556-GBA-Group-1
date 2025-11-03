// scripts/removeLiquidityFull.js
// Remove 100% liquidity for PrabhuToken-PC / WETH on Hoodi testnet
// Reads contract addresses dynamically from addresses.json
// Uses signer injected by Hardhat (mnemonic from FIN556_MNEMONIC)

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ---------------- CONFIG ---------------- //
const CONFIG = {
  REMOVE_BPS: 10000, // 100% removal
  SLIPPAGE_BPS: 100, // 1% slippage
  DEADLINE_SECS: 900, // 15-minute window
  INIT_TOKENS: 500000, // initial deposit
  INIT_ETH: 0.1,
};

// ---------------- ABI DEFINITIONS ---------------- //
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];
const FACTORY_ABI = [
  "function getPair(address,address) view returns (address)",
];
const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];
const ROUTER_ABI = [
  "function removeLiquidityETH(address token,uint liquidity,uint amountTokenMin,uint amountETHMin,address to,uint deadline) external returns (uint amountToken, uint amountETH)",
];

// ---------------- MAIN ---------------- //
async function main() {
  // Load addresses.json
  const addressesPath = path.join(__dirname, "addresses.json");
  if (!fs.existsSync(addressesPath)) {
    throw new Error("❌ addresses.json not found in scripts/ directory");
  }
  const addresses = JSON.parse(fs.readFileSync(addressesPath));

  const TOKEN = addresses.token || addresses.TOKEN;
  const WETH = addresses.weth9 || addresses.WETH;
  const FACTORY = addresses.factory || addresses.FACTORY;
  const ROUTER = addresses.router || addresses.ROUTER;

  if (!TOKEN || !WETH || !FACTORY || !ROUTER) {
    throw new Error("❌ Missing one or more addresses in addresses.json");
  }

  const [signer] = await ethers.getSigners();
  const me = await signer.getAddress();
  const provider = signer.provider;

  console.log(`\n🪪 Signer: ${me}`);
  console.log(`Network: Hoodi Testnet`);
  console.log(
    `Loaded from addresses.json:\nTOKEN=${TOKEN}\nWETH=${WETH}\nFACTORY=${FACTORY}\nROUTER=${ROUTER}`
  );

  // Contracts
  const token = new ethers.Contract(TOKEN, ERC20_ABI, signer);
  const factory = new ethers.Contract(FACTORY, FACTORY_ABI, signer);
  const router = new ethers.Contract(ROUTER, ROUTER_ABI, signer);

  const tokenSymbol = await token.symbol();
  const tokenDecimals = await token.decimals();

  const pairAddress = await factory.getPair(TOKEN, WETH);
  if (pairAddress === ethers.ZeroAddress) throw new Error("Pair not found");
  console.log(`Pair address: ${pairAddress}`);

  const pair = new ethers.Contract(pairAddress, PAIR_ABI, signer);

  // Balances before
  const beforeEth = await provider.getBalance(me);
  const beforeToken = await token.balanceOf(me);
  const beforeLP = await pair.balanceOf(me);

  console.log(`\n📊 Balances BEFORE:`);
  console.log(`ETH: ${ethers.formatEther(beforeEth)}`);
  console.log(
    `${tokenSymbol}: ${ethers.formatUnits(beforeToken, tokenDecimals)}`
  );
  console.log(`LP: ${ethers.formatEther(beforeLP)}`);

  if (beforeLP === 0n) throw new Error("No LP tokens found for removal.");

  // Expected outputs
  const [r0, r1] = Object.values(await pair.getReserves());
  const totalSupply = await pair.totalSupply();
  const token0 = await pair.token0();
  const isToken0 = token0.toLowerCase() === TOKEN.toLowerCase();
  const reserveToken = isToken0 ? r0 : r1;
  const reserveWeth = isToken0 ? r1 : r0;

  const expTokenOut = (reserveToken * beforeLP) / totalSupply;
  const expEthOut = (reserveWeth * beforeLP) / totalSupply;

  const slipBps = BigInt(CONFIG.SLIPPAGE_BPS);
  const amountTokenMin = expTokenOut - (expTokenOut * slipBps) / 10000n;
  const amountEthMin = expEthOut - (expEthOut * slipBps) / 10000n;
  const deadline = Math.floor(Date.now() / 1000) + CONFIG.DEADLINE_SECS;

  console.log(`\n💧 Expected Outputs:`);
  console.log(
    `${tokenSymbol}: ${ethers.formatUnits(expTokenOut, tokenDecimals)}`
  );
  console.log(`ETH: ${ethers.formatEther(expEthOut)}`);

  // Approve router
  const lpContract = new ethers.Contract(pairAddress, ERC20_ABI, signer);
  console.log(`\nApproving router to spend LP tokens...`);
  await (await lpContract.approve(ROUTER, beforeLP)).wait();
  console.log(`✅ Router approved`);

  // Remove liquidity
  console.log(`\nExecuting removeLiquidityETH(...) ...`);
  const tx = await router.removeLiquidityETH(
    TOKEN,
    beforeLP,
    amountTokenMin,
    amountEthMin,
    me,
    deadline
  );
  console.log(`⏳ Tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error("Transaction failed");
  console.log(`✅ Liquidity removed in block ${receipt.blockNumber}`);

  // Balances after
  const afterEth = await provider.getBalance(me);
  const afterToken = await token.balanceOf(me);
  const ethDelta = afterEth - beforeEth;
  const tokenDelta = afterToken - beforeToken;

  console.log(`\n📊 Balances AFTER:`);
  console.log(
    `ETH: ${ethers.formatEther(afterEth)} (Δ ${ethers.formatEther(ethDelta)})`
  );
  console.log(
    `${tokenSymbol}: ${ethers.formatUnits(
      afterToken,
      tokenDecimals
    )} (Δ ${ethers.formatUnits(tokenDelta, tokenDecimals)})`
  );

  // Impermanent loss
  const priceEthPerToken =
    Number(ethers.formatEther(reserveWeth)) /
    Number(ethers.formatUnits(reserveToken, tokenDecimals));
  const valueIfHodl = CONFIG.INIT_TOKENS * priceEthPerToken + CONFIG.INIT_ETH;
  const valueWithdrawn =
    Number(ethers.formatEther(ethDelta)) +
    Number(ethers.formatUnits(tokenDelta, tokenDecimals)) * priceEthPerToken;
  const il = valueWithdrawn - valueIfHodl;
  const ilPct = (il / valueIfHodl) * 100;

  console.log(`\n🔎 Impermanent Loss Analysis:`);
  console.log(
    `Spot price: ${priceEthPerToken.toFixed(8)} ETH per ${tokenSymbol}`
  );
  console.log(`Value if HODL: ${valueIfHodl.toFixed(6)} ETH`);
  console.log(`Value withdrawn: ${valueWithdrawn.toFixed(6)} ETH`);
  console.log(`Impermanent Loss: ${il.toFixed(6)} ETH (${ilPct.toFixed(2)}%)`);

  console.log(`\n📌 Transaction Hash: ${tx.hash}`);
  console.log(`✅ Completed successfully.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
