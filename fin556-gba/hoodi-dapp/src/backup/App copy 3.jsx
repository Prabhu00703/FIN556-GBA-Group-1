// App.jsx
import React, { useEffect, useState } from "react";
import {
  CssBaseline,
  Container,
  Button,
  TextField,
  Box,
  Divider,
  CircularProgress,
  Typography,
  Card,
} from "@mui/material";
import { ethers } from "ethers";

/*
  Single-file DApp (ethers v6)
  - Connect wallet
  - Buy token with ETH (ETH -> token)
  - Sell token for ETH (token -> ETH)
  - Swap token -> token (direct pair or via WETH fallback)
  - Auto-approve router if needed
  - Uses getAmountsOut to compute amountOutMin (slippage tolerance)
*/

/* CONFIG: Replace these with your deployed router & factory on Hoodi */
const DEFAULT_ROUTER = "0x5b491662E508c2E405500C8BF9d67E5dF780cD8e";
const DEFAULT_FACTORY = "0x342D7aeC78cd3b581eb67655B6B7Bb157328590e";
const HOODI_CHAIN_ID = 560048;

/* Minimal ABIs */
const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
];

const ROUTER_ABI = [
  "function WETH() view returns (address)",
  "function getAmountsOut(uint256,address[]) view returns (uint256[])",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",
];

const FACTORY_ABI = [
  "function getPair(address,address) view returns (address)",
];
const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112,uint112,uint32)",
];

const SHORT = (addr) =>
  addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "-";

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);

  const [routerAddr, setRouterAddr] = useState(DEFAULT_ROUTER);
  const [factoryAddr, setFactoryAddr] = useState(DEFAULT_FACTORY);

  const [myTokenAddr, setMyTokenAddr] = useState(""); // token you're selling/from
  const [otherTokenAddr, setOtherTokenAddr] = useState(""); // target token for swaps

  const [ethAmount, setEthAmount] = useState(""); // for buys
  const [tokenAmount, setTokenAmount] = useState(""); // for sells & swaps

  const [isLoading, setIsLoading] = useState(false);
  const [debug, setDebug] = useState("");

  // Initialize provider
  useEffect(() => {
    if (window.ethereum) {
      const p = new ethers.BrowserProvider(window.ethereum);
      setProvider(p);

      // listen account/chain changes
      if (window.ethereum.on) {
        window.ethereum.on("accountsChanged", (accounts) => {
          if (accounts && accounts.length) setAccount(accounts[0]);
          else {
            setAccount("");
            setSigner(null);
          }
        });
        window.ethereum.on("chainChanged", (hex) => {
          setChainId(Number.parseInt(hex, 16));
        });
      }
    }
  }, []);

  const connect = async () => {
    if (!provider) return alert("No Ethereum provider (MetaMask) found");
    try {
      await provider.send("eth_requestAccounts", []);
      const s = await provider.getSigner();
      const address = await s.getAddress();
      const net = await provider.getNetwork();
      setSigner(s);
      setAccount(address);
      setChainId(net.chainId);

      // ensure Hoodi
      if (net.chainId !== HOODI_CHAIN_ID) {
        try {
          await provider.send("wallet_switchEthereumChain", [
            { chainId: `0x${HOODI_CHAIN_ID.toString(16)}` },
          ]);
          setChainId(HOODI_CHAIN_ID);
        } catch (e) {
          console.warn("Switch chain failed:", e);
        }
      }
    } catch (e) {
      console.error(e);
      alert("Connect failed: " + (e?.message || e));
    }
  };

  // Utility: format big int with decimals
  const formatUnits = (bn, decimals = 18, precision = 6) =>
    Number(ethers.formatUnits(bn, decimals)).toFixed(Math.min(precision, 8));

  // Helper: ensure router & factory exist and fetch WETH
  const getRouterAndFactory = async () => {
    if (!provider) throw new Error("Provider missing");
    if (!routerAddr) throw new Error("Router address missing");
    const router = new ethers.Contract(
      routerAddr,
      ROUTER_ABI,
      signer || provider
    );
    const WETH = await router.WETH().catch(() => null);
    const factory = factoryAddr
      ? new ethers.Contract(factoryAddr, FACTORY_ABI, provider)
      : null;
    return { router, factory, WETH };
  };

  // Auto-approve helper (only if allowance insufficient)
  const ensureApproval = async (
    tokenAddress,
    ownerAddr,
    spenderAddr,
    amountBN
  ) => {
    const tokenRead = new ethers.Contract(
      tokenAddress,
      ["function allowance(address,address) view returns (uint256)"],
      provider
    );
    const allowance = await tokenRead.allowance(ownerAddr, spenderAddr);
    setDebug((d) => d + `\nallowance=${allowance.toString()}`);
    if (BigInt(allowance.toString() || "0") < BigInt(amountBN.toString())) {
      const tokenWrite = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      const tx = await tokenWrite.approve(spenderAddr, ethers.MaxUint256);
      setDebug((d) => d + `\napprove tx sent: ${tx.hash}`);
      await tx.wait();
      setDebug((d) => d + `\napprove confirmed`);
    } else {
      setDebug((d) => d + `\nno approve needed`);
    }
  };

  // Buy: ETH -> token
  const buyTokenWithETH = async () => {
    setDebug("");
    if (!signer) return alert("Connect wallet first");
    if (!routerAddr || !myTokenAddr || !ethAmount)
      return alert("Missing router/token/amount");
    setIsLoading(true);
    try {
      const { router } = await getRouterAndFactory();
      const WETH = await router.WETH();
      if (!WETH) throw new Error("Router WETH() failed");

      const amountIn = ethers.parseEther(String(ethAmount));
      // path WETH -> token
      const path = [WETH, myTokenAddr];

      // estimate amountsOut (to show debug)
      let amountsOut = null;
      try {
        amountsOut = await router.getAmountsOut(amountIn, path);
        setDebug(
          (d) =>
            d +
            `\ngetAmountsOut OK: out=${amountsOut[
              amountsOut.length - 1
            ].toString()}`
        );
      } catch (err) {
        setDebug(
          (d) =>
            d +
            `\ngetAmountsOut failed (pair may not exist): ${err.message || err}`
        );
      }

      const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
      const tx =
        await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
          0,
          path,
          account,
          deadline,
          { value: amountIn }
        );
      setDebug((d) => d + `\nswap tx sent: ${tx.hash}`);
      await tx.wait();
      setDebug((d) => d + `\nswap confirmed`);
      alert("Buy succeeded");
    } catch (err) {
      console.error(err);
      setDebug((d) => d + `\nBuy failed: ${String(err?.message || err)}`);
      alert("Buy failed: " + (err?.message || err));
    } finally {
      setIsLoading(false);
    }
  };

  // Sell: token -> ETH
  const sellTokenForETH = async () => {
    setDebug("");
    if (!signer) return alert("Connect wallet first");
    if (!routerAddr || !myTokenAddr || !tokenAmount)
      return alert("Missing router/token/amount");
    setIsLoading(true);
    try {
      const { router, factory, WETH } = await getRouterAndFactory();
      if (!WETH) throw new Error("Router WETH() failed");

      // check pair exists (token <-> WETH). If factory absent, we'll still attempt but getAmountsOut may fail.
      if (factory) {
        const pair = await factory.getPair(myTokenAddr, WETH);
        setDebug((d) => d + `\npair: ${pair}`);
        if (!pair || pair === ethers.ZeroAddress) {
          throw new Error("No token<->WETH pair (no liquidity)");
        }
      }

      // token decimals & parse
      const tokenRead = new ethers.Contract(myTokenAddr, ERC20_ABI, provider);
      const decimals = await tokenRead.decimals();
      const amountBN = ethers.parseUnits(String(tokenAmount), decimals);

      // ensure approval
      await ensureApproval(myTokenAddr, account, routerAddr, amountBN);

      // compute amountOutMin via getAmountsOut (apply slippage)
      let amountOutMin = 0n;
      try {
        const amounts = await router.getAmountsOut(amountBN, [
          myTokenAddr,
          WETH,
        ]);
        const quoted = BigInt(amounts[amounts.length - 1].toString());
        // 0.5% slippage tolerance
        amountOutMin = (quoted * 995n) / 1000n;
        setDebug(
          (d) => d + `\nquoted out=${quoted}, amountOutMin=${amountOutMin}`
        );
      } catch (err) {
        setDebug(
          (d) =>
            d +
            `\ngetAmountsOut failed: ${
              err.message || err
            } — fallback amountOutMin=0`
        );
        amountOutMin = 0n;
      }

      const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
      const tx =
        await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
          amountBN,
          amountOutMin,
          [myTokenAddr, WETH],
          account,
          deadline
        );
      setDebug((d) => d + `\nswap tx sent: ${tx.hash}`);
      await tx.wait();
      setDebug((d) => d + `\nswap confirmed`);
      alert("Sell succeeded");
    } catch (err) {
      console.error(err);
      setDebug((d) => d + `\nSell failed: ${String(err?.message || err)}`);
      alert("Sell failed: " + (err?.message || err));
    } finally {
      setIsLoading(false);
    }
  };

  // Swap token -> token (attempt direct pair; if missing, try via WETH [tokenA -> WETH -> tokenB])
  const swapTokenForToken = async () => {
    setDebug("");
    if (!signer) return alert("Connect wallet first");
    if (!routerAddr || !myTokenAddr || !otherTokenAddr || !tokenAmount)
      return alert("Missing router, tokens, or amount");

    setIsLoading(true);
    try {
      const { router, factory, WETH } = await getRouterAndFactory();
      if (!WETH) throw new Error("Router WETH() failed");

      // decimals parse
      const tokenARead = new ethers.Contract(myTokenAddr, ERC20_ABI, provider);
      const decA = await tokenARead.decimals();
      const amountBN = ethers.parseUnits(String(tokenAmount), decA);

      // Determine path:
      // 1) if factory.getPair(tokenA, tokenB) exists -> direct path
      // 2) else path = [tokenA, WETH, tokenB]
      let path = [myTokenAddr, otherTokenAddr];
      let hasDirect = false;
      if (factory) {
        const directPair = await factory.getPair(myTokenAddr, otherTokenAddr);
        setDebug((d) => d + `\ndirectPair: ${directPair}`);
        if (directPair && directPair !== ethers.ZeroAddress) hasDirect = true;
      } else {
        // if factory not provided, we can still attempt getAmountsOut for direct path and fallback if it reverts
        try {
          await router.getAmountsOut(amountBN, path);
          hasDirect = true;
        } catch (e) {
          hasDirect = false;
        }
      }

      if (!hasDirect) {
        path = [myTokenAddr, WETH, otherTokenAddr];
        setDebug((d) => d + `\nusing 2-hop path via WETH`);
      } else {
        setDebug((d) => d + `\nusing direct path`);
      }

      // Approval
      await ensureApproval(myTokenAddr, account, routerAddr, amountBN);

      // Estimate amountsOut and compute amountOutMin (slippage)
      let amountOutMin = 0n;
      try {
        const amounts = await router.getAmountsOut(amountBN, path);
        const quoted = BigInt(amounts[amounts.length - 1].toString());
        // 1% slippage tolerance for token->token
        amountOutMin = (quoted * 99n) / 100n;
        setDebug(
          (d) => d + `\nquoted out=${quoted}, amountOutMin=${amountOutMin}`
        );
      } catch (err) {
        setDebug(
          (d) => d + `\ngetAmountsOut failed: ${err.message || err} — aborting`
        );
        throw new Error(
          "getAmountsOut failed — likely no liquidity for chosen path"
        );
      }

      const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

      // Use supportingFeeOnTransferTokens variant (safer for tokens with fees)
      const tx =
        await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          amountBN,
          amountOutMin,
          path,
          account,
          deadline
        );
      setDebug((d) => d + `\nswap tx sent: ${tx.hash}`);
      await tx.wait();
      setDebug((d) => d + `\nswap confirmed`);
      alert("Swap succeeded");
    } catch (err) {
      console.error(err);
      setDebug((d) => d + `\nSwap failed: ${String(err?.message || err)}`);
      alert("Swap failed: " + (err?.message || err));
    } finally {
      setIsLoading(false);
    }
  };

  // Quick helper to fetch token symbol & balance for debug display
  const fetchTokenInfo = async (tokenAddr) => {
    if (!provider || !tokenAddr) return null;
    try {
      const t = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
      const sym = await t.symbol().catch(() => null);
      const dec = await t.decimals().catch(() => 18);
      const bal = account
        ? await t.balanceOf(account).catch(() => ethers.Zero)
        : ethers.Zero;
      return { sym, dec, bal };
    } catch (e) {
      return null;
    }
  };

  return (
    <>
      <CssBaseline />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h5" gutterBottom>
          DEX DApp — Swap / Buy / Sell (Hoodi)
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Button variant="contained" onClick={connect} disabled={!!account}>
            {account ? `Connected ${SHORT(account)}` : "Connect Wallet"}
          </Button>
          <Typography sx={{ mt: 1 }}>Chain: {chainId ?? "-"}</Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        <TextField
          label="Router Address"
          fullWidth
          value={routerAddr}
          onChange={(e) => setRouterAddr(e.target.value)}
          sx={{ mb: 1 }}
        />
        <TextField
          label="Factory Address (optional)"
          fullWidth
          value={factoryAddr}
          onChange={(e) => setFactoryAddr(e.target.value)}
          sx={{ mb: 2 }}
        />

        <Divider sx={{ my: 2 }} />

        <Typography variant="h6">Token Addresses</Typography>
        <TextField
          label="Your token (from) address"
          fullWidth
          value={myTokenAddr}
          onChange={(e) => setMyTokenAddr(e.target.value)}
          sx={{ my: 1 }}
        />
        <TextField
          label="Other token (to) address — for token→token swaps"
          fullWidth
          value={otherTokenAddr}
          onChange={(e) => setOtherTokenAddr(e.target.value)}
          sx={{ mb: 2 }}
        />

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1">Buy token with ETH</Typography>
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <TextField
            label="ETH amount"
            value={ethAmount}
            onChange={(e) => setEthAmount(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button
            variant="contained"
            onClick={buyTokenWithETH}
            disabled={isLoading}
          >
            {isLoading ? <CircularProgress size={20} /> : "Buy"}
          </Button>
        </Box>

        <Typography variant="subtitle1">Sell token for ETH</Typography>
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <TextField
            label="Token amount (human)"
            value={tokenAmount}
            onChange={(e) => setTokenAmount(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button
            variant="outlined"
            onClick={() => ensureApproval(myTokenAddr, account, routerAddr, 1)}
            disabled={!signer}
          >
            Approve (manual)
          </Button>
          <Button
            variant="contained"
            onClick={sellTokenForETH}
            disabled={isLoading}
          >
            {isLoading ? <CircularProgress size={20} /> : "Sell"}
          </Button>
        </Box>

        <Typography variant="subtitle1">Swap token → token</Typography>
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <TextField
            label="Token amount (human) — from your token"
            value={tokenAmount}
            onChange={(e) => setTokenAmount(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button
            variant="contained"
            onClick={swapTokenForToken}
            disabled={isLoading}
          >
            {isLoading ? <CircularProgress size={20} /> : "Swap"}
          </Button>
        </Box>

        <Divider sx={{ my: 2 }} />
        <Typography variant="h6">Debug / Logs</Typography>
        <Card sx={{ p: 2, whiteSpace: "pre-wrap", minHeight: 120 }}>
          {debug || "No logs yet"}
        </Card>
      </Container>
    </>
  );
}
