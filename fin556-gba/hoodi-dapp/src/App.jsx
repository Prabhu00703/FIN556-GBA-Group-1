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
  Tabs,
  Tab,
  Grid,
} from "@mui/material";
import { ethers } from "ethers";

/*
  Multi-tab DEX (ethers v6)
  Tab 1: Trading (UNCHANGED from your version)
  Tab 2: Token Balances (up to 5 addresses)
  Tab 3: Pool Info (up to 5 pair addresses + derived token↔ETH prices)
*/

/* CONFIG (same as your trading code) */
const DEFAULT_ROUTER = "0x5b491662E508c2E405500C8BF9d67E5dF780cD8e";
const DEFAULT_FACTORY = "0x342D7aeC78cd3b581eb67655B6B7Bb157328590e";
const HOODI_CHAIN_ID = 560048;

/* ABIs (same + read helpers) */
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
const fmt = (bn, d = 18, p = 6) =>
  Number(ethers.formatUnits(bn ?? 0n, d)).toFixed(Math.min(p, 8));

export default function App() {
  const [tab, setTab] = useState(0);

  /* ---------- SHARED (as in your trading code) ---------- */
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);

  const [routerAddr, setRouterAddr] = useState(DEFAULT_ROUTER);
  const [factoryAddr, setFactoryAddr] = useState(DEFAULT_FACTORY);

  const [myTokenAddr, setMyTokenAddr] = useState(""); // from token (your token)
  const [otherTokenAddr, setOtherTokenAddr] = useState(""); // to token

  const [ethAmount, setEthAmount] = useState(""); // for buys
  const [tokenAmount, setTokenAmount] = useState(""); // for sells & swaps

  const [isLoading, setIsLoading] = useState(false);
  const [debug, setDebug] = useState("");

  // Initialize provider
  useEffect(() => {
    if (window.ethereum) {
      const p = new ethers.BrowserProvider(window.ethereum);
      setProvider(p);

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

  // ======= TRADING LOGIC (UNCHANGED) =======

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
      const path = [WETH, myTokenAddr];

      try {
        const amountsOut = await router.getAmountsOut(amountIn, path);
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

      if (factory) {
        const pair = await factory.getPair(myTokenAddr, WETH);
        setDebug((d) => d + `\npair: ${pair}`);
        if (!pair || pair === ethers.ZeroAddress) {
          throw new Error("No token<->WETH pair (no liquidity)");
        }
      }

      const tokenRead = new ethers.Contract(myTokenAddr, ERC20_ABI, provider);
      const decimals = await tokenRead.decimals();
      const amountBN = ethers.parseUnits(String(tokenAmount), decimals);

      await ensureApproval(myTokenAddr, account, routerAddr, amountBN);

      let amountOutMin = 0n;
      try {
        const amounts = await router.getAmountsOut(amountBN, [
          myTokenAddr,
          WETH,
        ]);
        const quoted = BigInt(amounts[amounts.length - 1].toString());
        amountOutMin = (quoted * 995n) / 1000n; // 0.5% slippage
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

  // Swap token -> token (direct or via WETH)
  const swapTokenForToken = async () => {
    setDebug("");
    if (!signer) return alert("Connect wallet first");
    if (!routerAddr || !myTokenAddr || !otherTokenAddr || !tokenAmount)
      return alert("Missing router, tokens, or amount");

    setIsLoading(true);
    try {
      const { router, factory, WETH } = await getRouterAndFactory();
      if (!WETH) throw new Error("Router WETH() failed");

      const tokenARead = new ethers.Contract(myTokenAddr, ERC20_ABI, provider);
      const decA = await tokenARead.decimals();
      const amountBN = ethers.parseUnits(String(tokenAmount), decA);

      let path = [myTokenAddr, otherTokenAddr];
      let hasDirect = false;
      if (factory) {
        const directPair = await factory.getPair(myTokenAddr, otherTokenAddr);
        setDebug((d) => d + `\ndirectPair: ${directPair}`);
        if (directPair && directPair !== ethers.ZeroAddress) hasDirect = true;
      } else {
        try {
          await router.getAmountsOut(amountBN, path);
          hasDirect = true;
        } catch {
          hasDirect = false;
        }
      }
      if (!hasDirect) {
        path = [myTokenAddr, WETH, otherTokenAddr];
        setDebug((d) => d + `\nusing 2-hop path via WETH`);
      } else {
        setDebug((d) => d + `\nusing direct path`);
      }

      await ensureApproval(myTokenAddr, account, routerAddr, amountBN);

      let amountOutMin = 0n;
      try {
        const amounts = await router.getAmountsOut(amountBN, path);
        const quoted = BigInt(amounts[amounts.length - 1].toString());
        amountOutMin = (quoted * 99n) / 100n; // 1% slippage
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

  /* ---------- Token Balances tab ---------- */
  const [tokenInputs, setTokenInputs] = useState(["", "", "", "", ""]);
  const [tokenInfos, setTokenInfos] = useState([]);

  const fetchTokenData = async () => {
    if (!provider || !account) return alert("Connect wallet first");
    setIsLoading(true);
    const results = [];
    for (const addr of tokenInputs.filter(Boolean)) {
      try {
        const t = new ethers.Contract(addr, ERC20_ABI, provider);
        const [symbol, decimals, balance] = await Promise.all([
          t.symbol(),
          t.decimals(),
          t.balanceOf(account),
        ]);
        results.push({
          address: addr,
          symbol,
          decimals,
          balance: fmt(balance, decimals),
        });
      } catch (err) {
        results.push({ address: addr, error: err.message });
      }
    }
    setTokenInfos(results);
    setIsLoading(false);
  };

  /* ---------- Pool Info tab (with derived token↔ETH prices) ---------- */
  const [pairInputs, setPairInputs] = useState(["", "", "", "", ""]);
  const [pairInfos, setPairInfos] = useState([]);

  const fetchPairData = async () => {
    if (!provider || !routerAddr)
      return alert("Connect wallet and set router first");
    setIsLoading(true);
    const router = new ethers.Contract(routerAddr, ROUTER_ABI, provider);
    let WETH = null;
    try {
      WETH = await router.WETH();
    } catch {}
    const results = [];

    for (const addr of pairInputs.filter(Boolean)) {
      try {
        const pair = new ethers.Contract(addr, PAIR_ABI, provider);
        const [token0, token1, reserves] = await Promise.all([
          pair.token0(),
          pair.token1(),
          pair.getReserves(),
        ]);

        const t0 = new ethers.Contract(token0, ERC20_ABI, provider);
        const t1 = new ethers.Contract(token1, ERC20_ABI, provider);
        const [sym0, dec0, sym1, dec1] = await Promise.all([
          t0.symbol().catch(() => "T0"),
          t0.decimals().catch(() => 18),
          t1.symbol().catch(() => "T1"),
          t1.decimals().catch(() => 18),
        ]);

        // Derived prices vs ETH using router.getAmountsOut on 1 token
        let p0InETH = null,
          p1InETH = null;
        if (WETH) {
          const one0 = ethers.parseUnits("1", dec0);
          const one1 = ethers.parseUnits("1", dec1);
          // token0 -> ETH
          try {
            const out0 = await router.getAmountsOut(one0, [token0, WETH]);
            p0InETH = Number(ethers.formatUnits(out0[out0.length - 1], 18));
          } catch {}
          // token1 -> ETH
          try {
            const out1 = await router.getAmountsOut(one1, [token1, WETH]);
            p1InETH = Number(ethers.formatUnits(out1[out1.length - 1], 18));
          } catch {}
        }

        results.push({
          address: addr,
          token0,
          token1,
          sym0,
          sym1,
          dec0,
          dec1,
          reserve0: reserves[0],
          reserve1: reserves[1],
          price0InETH: p0InETH, // 1 token0 = p0InETH ETH
          price1InETH: p1InETH, // 1 token1 = p1InETH ETH
        });
      } catch (err) {
        results.push({ address: addr, error: err.message });
      }
    }
    setPairInfos(results);
    setIsLoading(false);
  };

  return (
    <>
      <CssBaseline />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h5" gutterBottom>
          DEX DApp — Multi Tab (Hoodi)
        </Typography>

        <Button variant="contained" onClick={connect} sx={{ mb: 2 }}>
          {account ? `CONNECTED ${SHORT(account)}` : "Connect Wallet"}
        </Button>
        <Typography sx={{ mb: 1 }}>Chain: {chainId ?? "-"}</Typography>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
          <Tab label="Trading" />
          <Tab label="Token Balances" />
          <Tab label="Pool Info" />
        </Tabs>

        {/* ---------------- Trading Tab (your original UI, unchanged) ---------------- */}
        {tab === 0 && (
          <>
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
                onClick={() =>
                  ensureApproval(myTokenAddr, account, routerAddr, 1)
                }
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
          </>
        )}

        {/* ---------------- Token Balances Tab ---------------- */}
        {tab === 1 && (
          <>
            <Typography variant="h6">Token Balances</Typography>
            <Typography sx={{ mb: 1 }}>
              Enter up to 5 token addresses:
            </Typography>
            {tokenInputs.map((addr, i) => (
              <TextField
                key={i}
                fullWidth
                sx={{ mb: 1 }}
                label={`Token ${i + 1} Address`}
                value={addr}
                onChange={(e) =>
                  setTokenInputs((prev) => {
                    const arr = [...prev];
                    arr[i] = e.target.value;
                    return arr;
                  })
                }
              />
            ))}
            <Button
              variant="contained"
              onClick={fetchTokenData}
              disabled={isLoading}
              sx={{ mt: 1 }}
            >
              {isLoading ? <CircularProgress size={20} /> : "Fetch Balances"}
            </Button>

            {tokenInfos.length > 0 && (
              <Box sx={{ mt: 2 }}>
                {tokenInfos.map((t, i) => (
                  <Card key={i} sx={{ p: 2, mb: 1 }}>
                    <Typography>
                      <b>{SHORT(t.address)}</b>{" "}
                      {t.error ? (
                        <span style={{ color: "red" }}>({t.error})</span>
                      ) : (
                        <>
                          — {t.symbol} <br />
                          Decimals: {t.decimals} <br />
                          Balance: {t.balance}
                        </>
                      )}
                    </Typography>
                  </Card>
                ))}
              </Box>
            )}
          </>
        )}

        {/* ---------------- Pool Info Tab ---------------- */}
        {tab === 2 && (
          <>
            <Typography variant="h6">Pool Info</Typography>
            <Typography sx={{ mb: 1 }}>
              Enter up to 5 UniswapV2 pair contract addresses:
            </Typography>
            {pairInputs.map((addr, i) => (
              <TextField
                key={i}
                fullWidth
                sx={{ mb: 1 }}
                label={`Pair ${i + 1} Address`}
                value={addr}
                onChange={(e) =>
                  setPairInputs((prev) => {
                    const arr = [...prev];
                    arr[i] = e.target.value;
                    return arr;
                  })
                }
              />
            ))}
            <Button
              variant="contained"
              onClick={fetchPairData}
              disabled={isLoading}
              sx={{ mt: 1 }}
            >
              {isLoading ? <CircularProgress size={20} /> : "Fetch Pools"}
            </Button>

            {pairInfos.length > 0 && (
              <Grid container spacing={2} sx={{ mt: 2 }}>
                {pairInfos.map((p, i) => (
                  <Grid item xs={12} key={i}>
                    <Card sx={{ p: 2 }}>
                      <Typography>
                        <b>Pair:</b> {SHORT(p.address)}{" "}
                        {p.error && (
                          <span style={{ color: "red" }}>({p.error})</span>
                        )}
                      </Typography>
                      {!p.error && (
                        <>
                          <Typography sx={{ mt: 1 }}>
                            token0: {p.sym0} ({SHORT(p.token0)}) <br />
                            token1: {p.sym1} ({SHORT(p.token1)})
                          </Typography>
                          <Typography sx={{ mt: 1 }}>
                            reserve0: {fmt(p.reserve0, p.dec0)} {p.sym0} <br />
                            reserve1: {fmt(p.reserve1, p.dec1)} {p.sym1}
                          </Typography>
                          <Typography sx={{ mt: 1 }}>
                            {/* Derived prices in ETH for 1 token */}
                            {typeof p.price0InETH === "number"
                              ? `1 ${p.sym0} ≈ ${p.price0InETH} ETH`
                              : `1 ${p.sym0} → ETH: N/A`}
                            <br />
                            {typeof p.price1InETH === "number"
                              ? `1 ${p.sym1} ≈ ${p.price1InETH} ETH`
                              : `1 ${p.sym1} → ETH: N/A`}
                          </Typography>
                        </>
                      )}
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </>
        )}
      </Container>
    </>
  );
}
