import { ethers } from "ethers";

const provider = window.ethereum
    ? new ethers.BrowserProvider(window.ethereum)
    : null;

const getAccount = async () => {
    if (!provider) return null;
    await provider.send("eth_requestAccounts", []); // Login to metamask
    const account = provider.getSigner();

    const { chainId } = await provider.getNetwork();
    console.log("Connected to chainId:", chainId);

    // const DESIRED_CHAIN_ID = 31337; // This is the default chain ID for hardhat localhost network
    // if (chainId !== DESIRED_CHAIN_ID) {
    //     await provider.send("wallet_switchEthereumChain", [
    //         { chainId: `0x${DESIRED_CHAIN_ID.toString(16)}` }, // Must be in hex format
    //     ]);
    // }

    return account;
};

export { getAccount };
