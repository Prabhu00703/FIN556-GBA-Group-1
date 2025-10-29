const { ethers } = require("hardhat");
const { saveJson, delay } = require("./deployLib.js");
const path = require("path");
const ADDRESS_FILE = "addresses.json";
const filePath = path.join(__dirname, ADDRESS_FILE);

async function main() {
    // Get the first signer/account to deploy the contract
    const signer = (await ethers.getSigners())[0];
    console.log(`Using account: ${await signer.getAddress()}`);

    //Deploy WETH9 contract
    const WETH9 = await ethers.getContractFactory(
        "contracts/v2-periphery/test/WETH9.sol:WETH9"
    );
    const weth9 = await WETH9.deploy();
    await weth9.waitForDeployment();
    weth9Address = await weth9.getAddress();
    console.log(`WETH9 deployed to: ${weth9Address}`);
    // weth9Address = "0x412E840F46ec463D26B540d1C326fCc929003B76"

    await delay(3000);

    // Save token1 address
    saveJson(filePath, { weth9: weth9Address });
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
