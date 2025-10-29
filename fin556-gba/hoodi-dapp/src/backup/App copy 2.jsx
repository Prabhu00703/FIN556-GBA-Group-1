import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  CssBaseline,
  Container,
  Card,
  Button,
  TextField,
  Box,
  Divider,
  CircularProgress,
  Alert,
} from "@mui/material";
import useDapp from "./useDapp";

const HOODI_CHAIN_ID = 560048; // Change to your desired chain ID

const App = () => {
  const [signer, setSigner] = useState(null);
  const [network, setNetwork] = useState(null);
  const [tokenAddrA, setTokenAddrA] = useState("");
  const [tokenAddrB, setTokenAddrB] = useState("");
  const [uniswapRouterAddress, setUniswapRouterAddress] = useState("");
  const [uniswapFactoryAddress, setUniswapFactoryAddress] = useState("");
  const [balance, setBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [amtA, setAmtA] = useState("");
  const [amtB, setAmtB] = useState("");
  const [txStatus, setTxStatus] = useState(null);

  const { connect, getBalance, sellTokens, buyTokens } = useDapp({
    setSigner,
    uniswapRouterAddress,
    uniswapFactoryAddress,
    tokenAddrA,
    tokenAddrB,
  });

  // ----------------------
  // Check network
  // ----------------------
  const checkNetwork = async (provider) => {
    if (!provider) return;
    const { chainId } = await provider.getNetwork();
    setNetwork({ chainId, isHoodi: chainId === HOODI_CHAIN_ID });
  };

  const switchNetwork = async () => {
    if (!window.ethereum) return alert("MetaMask not installed");
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${HOODI_CHAIN_ID.toString(16)}` }],
      });
      const provider = new ethers.BrowserProvider(window.ethereum);
      await checkNetwork(provider);
    } catch (err) {
      console.error(err);
      alert("Failed to switch network");
    }
  };

  // ----------------------
  // Connect wallet on load
  // ----------------------
  useEffect(() => {
    const start = async () => {
      const s = await connect();
      if (!s) {
        alert(
          "MetaMask is not installed. Please install MetaMask to use this DApp."
        );
        return;
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      await checkNetwork(provider);

      window.ethereum.on("chainChanged", async () => {
        await checkNetwork(provider);
      });
      window.ethereum.on("accountsChanged", async () => {
        await connect();
      });
    };
    start();
  }, []);

  // ----------------------
  // Fetch balances
  // ----------------------
  const handleCheckBalance = async () => {
    if (!signer) return alert("Please connect your wallet first");
    setIsLoading(true);
    try {
      const bal = await getBalance(signer);
      setBalance(bal);
    } catch (error) {
      console.error("Error fetching balances:", error);
      alert("Failed to fetch balances. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ----------------------
  // Sell tokens
  // ----------------------
  const handleSell = async (tokenType) => {
    if (!signer) return alert("Please connect your wallet first");

    setIsLoading(true);
    setTxStatus(null);
    try {
      if (tokenType === "A") {
        if (!amtA) return alert("Enter a valid amount for TokenA");
        const output = await sellTokens(
          BigInt(amtA),
          tokenAddrA,
          tokenAddrB,
          signer
        );
        setTxStatus(`Sold ${amtA} of TokenA for ${output} of TokenB`);
      } else if (tokenType === "B") {
        if (!amtB) return alert("Enter a valid amount for TokenB");
        const output = await sellTokens(
          BigInt(amtB),
          tokenAddrB,
          tokenAddrA,
          signer
        );
        setTxStatus(`Sold ${amtB} of TokenB for ${output} of TokenA`);
      }
      await handleCheckBalance();
    } catch (error) {
      console.error("Error selling tokens:", error);
      alert("Failed to sell tokens. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ----------------------
  // Buy tokens with ETH
  // ----------------------
  const handleBuy = async (tokenType) => {
    if (!signer) return alert("Please connect your wallet first");

    setIsLoading(true);
    setTxStatus(null);
    try {
      if (tokenType === "A") {
        if (!amtA) return alert("Enter ETH amount to buy TokenA");
        const txHash = await buyTokens(amtA, tokenAddrA, signer);
        setTxStatus(`Bought TokenA: Tx Hash ${txHash}`);
      } else if (tokenType === "B") {
        if (!amtB) return alert("Enter ETH amount to buy TokenB");
        const txHash = await buyTokens(amtB, tokenAddrB, signer);
        setTxStatus(`Bought TokenB: Tx Hash ${txHash}`);
      }
      await handleCheckBalance();
    } catch (error) {
      console.error("Error buying tokens:", error);
      alert("Failed to buy tokens. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <CssBaseline />
      <Container>
        <h1>DEX DApp</h1>
        <p>Connected to MetaMask with address: {signer?.address}</p>
        <p>
          Network: {network?.chainId}{" "}
          {!network?.isHoodi && network ? (
            <Alert severity="warning" sx={{ mt: 1, mb: 2 }}>
              Not on Hoodi network!{" "}
              <Button onClick={switchNetwork} size="small" variant="outlined">
                Switch
              </Button>
            </Alert>
          ) : null}
        </p>

        <h2>Contract Configuration</h2>
        <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
          <TextField
            label="Uniswap Router Address"
            sx={{ flex: 1 }}
            value={uniswapRouterAddress}
            onChange={(e) => setUniswapRouterAddress(e.target.value)}
          />
          <TextField
            label="Uniswap Factory Address"
            sx={{ flex: 1 }}
            value={uniswapFactoryAddress}
            onChange={(e) => setUniswapFactoryAddress(e.target.value)}
          />
        </Box>

        <Divider sx={{ my: 3 }} />

        <h2>Liquidity Pool</h2>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <TextField
            label="TokenA Address"
            value={tokenAddrA}
            sx={{ flex: 1 }}
            onChange={(e) => setTokenAddrA(e.target.value)}
          />
          <TextField
            label="TokenB Address"
            value={tokenAddrB}
            sx={{ flex: 1 }}
            onChange={(e) => setTokenAddrB(e.target.value)}
          />
          {isLoading ? (
            <CircularProgress />
          ) : (
            <Button onClick={handleCheckBalance} variant="contained">
              Check Balances
            </Button>
          )}
        </Box>

        {txStatus && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {txStatus}
          </Alert>
        )}

        {/* Token Balances & Pool Info */}
        <Box sx={{ display: "flex", gap: 3, mb: 4 }}>
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <h3>Token Balance</h3>
            <Card sx={{ p: 3, flexGrow: 1 }}>
              <ul style={{ margin: 0, paddingLeft: "20px" }}>
                <li>TokenA: {balance?.balanceA}</li>
                <li>TokenB: {balance?.balanceB}</li>
                <li>Liquidity: {balance?.liquidity}</li>
              </ul>
            </Card>
          </Box>
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <h3>Pool Reserves</h3>
            <Card sx={{ p: 3, flexGrow: 1 }}>
              <ul style={{ margin: 0, paddingLeft: "20px" }}>
                <li>TokenA: {balance?.reservesA}</li>
                <li>TokenB: {balance?.reservesB}</li>
              </ul>
            </Card>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        <h2>Token Swap</h2>
        <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
          <TextField
            label="TokenA Amount / ETH"
            value={amtA}
            onChange={(e) => setAmtA(e.target.value)}
            fullWidth
          />
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="contained" onClick={() => handleBuy("A")}>
              Buy
            </Button>
            <Button variant="outlined" onClick={() => handleSell("A")}>
              Sell
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
          <TextField
            label="TokenB Amount / ETH"
            value={amtB}
            onChange={(e) => setAmtB(e.target.value)}
            fullWidth
          />
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="contained" onClick={() => handleBuy("B")}>
              Buy
            </Button>
            <Button variant="outlined" onClick={() => handleSell("B")}>
              Sell
            </Button>
          </Box>
        </Box>

        {isLoading && <CircularProgress />}
      </Container>
    </>
  );
};

export default App;
