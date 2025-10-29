import { ethers } from "ethers";

const HOODI_CHAIN_ID = 560048; // Hoodi testnet

const useDapp = ({ setSigner, routerAddress }) => {
  const provider = window.ethereum
    ? new ethers.BrowserProvider(window.ethereum)
    : null;

  const connect = async () => {
    if (!provider) return null;

    // Request account access
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const { chainId } = await provider.getNetwork();

    // Switch to Hoodi if not connected
    if (chainId !== HOODI_CHAIN_ID) {
      try {
        await provider.send("wallet_switchEthereumChain", [
          { chainId: `0x${HOODI_CHAIN_ID.toString(16)}` },
        ]);
      } catch (err) {
        alert("Please switch to Hoodi testnet in MetaMask!");
        return null;
      }
    }

    setSigner(signer);
    return signer;
  };

  // -------------------------------
  // Buy your token with ETH
  // -------------------------------
  const buyTokenWithETH = async (ethAmount, tokenAddress, signer) => {
    const router = new ethers.Contract(
      routerAddress,
      [
        "function WETH() view returns(address)",
        "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256) payable external",
      ],
      signer
    );

    const WETH = await router.WETH();
    const path = [WETH, tokenAddress];
    const amountIn = ethers.parseEther(ethAmount.toString());
    const deadline = Math.floor(Date.now() / 1000) + 600;

    const tx = await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
      0,
      path,
      await signer.getAddress(),
      deadline,
      { value: amountIn }
    );
    await tx.wait();
    return tx.hash;
  };

  // -------------------------------
  // Sell your token for ETH
  // -------------------------------
  const sellTokenForETH = async (tokenAmount, tokenAddress, signer) => {
    const router = new ethers.Contract(
      routerAddress,
      [
        "function WETH() view returns(address)",
        "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256) external",
      ],
      signer
    );

    const WETH = await router.WETH();
    const path = [tokenAddress, WETH];
    const deadline = Math.floor(Date.now() / 1000) + 600;

    const token = new ethers.Contract(
      tokenAddress,
      ["function approve(address,uint256) public returns(bool)"],
      signer
    );
    await token.approve(router.address, tokenAmount);

    const tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
      tokenAmount,
      0,
      path,
      await signer.getAddress(),
      deadline
    );
    await tx.wait();
    return tx.hash;
  };

  // -------------------------------
  // Swap your token for another token
  // -------------------------------
  const swapTokenForToken = async (tokenAmount, fromToken, toToken, signer) => {
    const router = new ethers.Contract(
      routerAddress,
      [
        "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256) external",
      ],
      signer
    );

    const token = new ethers.Contract(
      fromToken,
      ["function approve(address,uint256) public returns(bool)"],
      signer
    );
    await token.approve(router.address, tokenAmount);

    const path = [fromToken, toToken];
    const deadline = Math.floor(Date.now() / 1000) + 600;

    const tx =
      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        tokenAmount,
        0,
        path,
        await signer.getAddress(),
        deadline
      );
    await tx.wait();
    return tx.hash;
  };

  return {
    connect,
    buyTokenWithETH,
    sellTokenForETH,
    swapTokenForToken,
  };
};

export default useDapp;
