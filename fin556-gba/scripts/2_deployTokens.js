const { ethers } = require("hardhat");
const { saveJson, delay } = require("./deployLib.js");
const path = require("path");
const ADDRESS_FILE = "addresses.json";
const filePath = path.join(__dirname, ADDRESS_FILE);

async function main() {
  // Get the first signer/account to deploy the contract
  const signer = (await ethers.getSigners())[0];
  console.log(`Using account: ${await signer.getAddress()}`);

  // Deploy TokenPC
  const TokenA = await ethers.getContractFactory("DemoTokenYOURINITIALS");
  token = await TokenA.deploy();
  await token.waitForDeployment();
  tokenAddress = await token.getAddress();
  console.log(`Token deployed to: ${tokenAddress}`);
  await delay(3000);

  // Save token address
  saveJson(filePath, { token: tokenAddress });

  // Deploy Token1
  //const TokenB = await ethers.getContractFactory("DemoTokenB");
  //token1 = await TokenB.deploy();
  //await token1.waitForDeployment();
  //token1Address = await token1.getAddress();
  //console.log(`Token1 deployed to: ${token1Address}`);
  //await delay(3000);

  // Save token1 address
  //saveJson(filePath, { token1: token1Address });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
