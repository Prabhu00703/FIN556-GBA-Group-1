const { ethers } = require("hardhat");
const { saveJson, getAddress, delay } = require("./deployLib.js");
const path = require("path");
const ADDRESS_FILE = "addresses.json";
const filePath = path.join(__dirname, ADDRESS_FILE);

async function main() {
    // Get the first signer/account to deploy the contract
    const signer = (await ethers.getSigners())[0];
    console.log(`Using account: ${await signer.getAddress()}`);

    // Deploy UniswapV2Factory
    const Factory = await ethers.getContractFactory("UniswapV2Factory");
    factory = await Factory.deploy(signer.address);
    await factory.waitForDeployment();
    factoryAddress = await factory.getAddress();
    setTimeout(() => {}, 3000);
    console.log(`UniswapV2Factory deployed to: ${factoryAddress}`);
    saveJson(filePath, { factory: factoryAddress });
    await delay(3000);

    // Deploy UniswapV2Router02
    const Router = await ethers.getContractFactory("UniswapV2Router02");
    const weth9Address = getAddress(filePath, "weth9");
    router = await Router.deploy(
        factory.target,
        weth9Address // WETH address (not used in this test)
    );
    await router.waitForDeployment();
    routerAddress = await router.getAddress();
    console.log(`UniswapV2Router02 deployed to: ${routerAddress}`);
    saveJson(filePath, { router: routerAddress });
    await delay(3000);
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
