require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.5.16",
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.20",
      },
    ],
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      accounts: {
        mnemonic: process.env.FIN556_MNEMONIC,
      },
    },
    hoodi: {
      chainId: 560048,
      url: process.env.FIN556_ALCHEMY_URL,
      accounts: {
        mnemonic: process.env.FIN556_MNEMONIC,
      },
    },
    hardhat: {
      accounts: {
        mnemonic: process.env.FIN556_MNEMONIC,
      },
    },
  },
};
