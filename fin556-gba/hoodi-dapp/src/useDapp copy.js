import { ethers } from "ethers";

const useDapp = ({
  setSigner,
  uniswapRouterAddress,
  uniswapFactoryAddress,
  tokenAddrA,
  tokenAddrB,
}) => {
  const provider = window.ethereum
    ? new ethers.BrowserProvider(window.ethereum)
    : null;

  const connect = async () => {
    if (!provider) return null;

    await provider.send("eth_requestAccounts", []); // Login to metamask
    const signer = await provider.getSigner();
    const { chainId } = await provider.getNetwork();
    console.log("Connected to chainId:", chainId);

    //const DESIRED_CHAIN_ID = 31337;560048
    const DESIRED_CHAIN_ID = 560048;
    560048;
    if (chainId !== DESIRED_CHAIN_ID) {
      await provider.send("wallet_switchEthereumChain", [
        { chainId: `0x${DESIRED_CHAIN_ID.toString(16)}` },
      ]);
    }

    setSigner(signer);
    return signer;
  };

  const getBalance = async (signer) => {
    if (!signer) throw new Error("Signer not connected");
    if (!tokenAddrA || !tokenAddrB || !uniswapFactoryAddress)
      throw new Error("Token or factory address missing");

    const address = await signer.getAddress();

    const tokenA = new ethers.Contract(
      tokenAddrA,
      ["function balanceOf(address) view returns(uint256)"],
      signer
    );

    const tokenB = new ethers.Contract(
      tokenAddrB,
      ["function balanceOf(address) view returns(uint256)"],
      signer
    );

    const factory = new ethers.Contract(
      uniswapFactoryAddress,
      ["function getPair(address,address) view returns(address)"],
      signer
    );

    const poolAddress = await factory.getPair(tokenAddrA, tokenAddrB);
    if (poolAddress === ethers.ZeroAddress) throw new Error("No pool found");

    const pool = new ethers.Contract(
      poolAddress,
      [
        "function getReserves() view returns(uint112 reserve0,uint112 reserve1,uint32)",
        "function balanceOf(address) view returns(uint256)",
      ],
      signer
    );

    const { reserve0, reserve1 } = await pool.getReserves();
    const reservesA =
      tokenAddrA.toLowerCase() < tokenAddrB.toLowerCase() ? reserve0 : reserve1;
    const reservesB =
      tokenAddrA.toLowerCase() > tokenAddrB.toLowerCase() ? reserve0 : reserve1;

    return {
      balanceA: (await tokenA.balanceOf(address)).toString(),
      balanceB: (await tokenB.balanceOf(address)).toString(),
      liquidity: (await pool.balanceOf(address)).toString(),
      reservesA: reservesA.toString(),
      reservesB: reservesB.toString(),
    };
  };

  const _getAmountOut = (amountIn, reserveIn, reserveOut) => {
    const amtIn = ethers.toBigInt(amountIn);
    const resIn = ethers.toBigInt(reserveIn);
    const resOut = ethers.toBigInt(reserveOut);

    const amountInWithFee = amtIn * 997n;
    const numerator = amountInWithFee * resOut;
    const denominator = resIn * 1000n + amountInWithFee;
    return numerator / denominator;
  };

  const _getReserves = async (factory, token0, token1, account) => {
    const poolAddress = await factory.getPair(token0, token1);
    if (poolAddress === ethers.ZeroAddress) throw new Error("No pool found");

    const pool = new ethers.Contract(
      poolAddress,
      [
        "function getReserves() view returns(uint112 reserve0,uint112 reserve1,uint32)",
      ],
      account
    );

    const { reserve0, reserve1 } = await pool.getReserves();
    return {
      reserveA:
        token0.toLowerCase() < token1.toLowerCase() ? reserve0 : reserve1,
      reserveB:
        token0.toLowerCase() > token1.toLowerCase() ? reserve0 : reserve1,
    };
  };

  const sellTokens = async (inputAmt, inputAddr, outputAddr, account) => {
    if (!account) throw new Error("Account not connected");
    if (!uniswapFactoryAddress || !uniswapRouterAddress)
      throw new Error("Router or Factory address missing");

    const factory = new ethers.Contract(
      uniswapFactoryAddress,
      ["function getPair(address,address) view returns(address)"],
      account
    );

    const reserves = await _getReserves(
      factory,
      inputAddr,
      outputAddr,
      account
    );

    const outputAmt = _getAmountOut(
      inputAmt,
      reserves.reserveA,
      reserves.reserveB
    );

    const uniswap = new ethers.Contract(
      uniswapRouterAddress,
      [
        "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
      ],
      account
    );

    const inputToken = new ethers.Contract(
      inputAddr,
      ["function approve(address,uint256)"],
      account
    );
    const approval = await inputToken.approve(uniswapRouterAddress, inputAmt);
    await approval.wait();

    const block = await provider.getBlock("latest");
    const deadline = block.timestamp + 1000;

    await uniswap.swapExactTokensForTokens(
      inputAmt,
      outputAmt,
      [inputAddr, outputAddr],
      await account.getAddress(),
      deadline
    );

    return outputAmt.toString();
  };

  const buyTokens = async () => {
    throw new Error("Not implemented");
  };

  return {
    connect,
    getBalance,
    sellTokens,
    buyTokens,
  };
};

export default useDapp;
