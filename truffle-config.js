const HDWalletProvider = require("@truffle/hdwallet-provider");
const NonceTrackerSubprovider = require("web3-provider-engine/subproviders/nonce-tracker");

const secrets = require("./secrets.json");

module.exports = {
  networks: {
    develop: {
      network_id: "*",
      host: "localhost",
      port: 8545
    },
    polygon: {
      provider: function () {
        const wallet = new HDWalletProvider(
          secrets.polygon.mnemonic,
          secrets.polygon.rpcURL
        );
        const nonceTracker = new NonceTrackerSubprovider();
        wallet.engine._providers.unshift(nonceTracker);
        nonceTracker.setEngine(wallet.engine);
        return wallet;
      },
      network_id: 137,
      confirmations: 2,
      //websockets: true
    },
    mumbai: {
      provider: function () {
        const wallet = new HDWalletProvider(
          secrets.mumbai.mnemonic,
          secrets.mumbai.rpcURL
        );
        const nonceTracker = new NonceTrackerSubprovider();
        wallet.engine._providers.unshift(nonceTracker);
        nonceTracker.setEngine(wallet.engine);
        return wallet;
      },
      network_id: 80001,
      confirmations: 0,
      skipDryRun: true,
    },
    kovan: {
      provider: function () {
        const wallet = new HDWalletProvider(
          secrets.kovan.mnemonic,
          secrets.kovan.rpcURL
        );
        const nonceTracker = new NonceTrackerSubprovider();
        wallet.engine._providers.unshift(nonceTracker);
        nonceTracker.setEngine(wallet.engine);
        return wallet;
      },
      network_id: 42,
      gas: 30000000,
      gasPrice: 5000000000,
      confirmations: 0,
      skipDryRun: true,
      //websockets: true
    },
    bsctestnet: {
      provider: function () {
        const wallet = new HDWalletProvider(
          secrets.bsctestnet.mnemonic,
          secrets.bsctestnet.rpcURL
        );
        const nonceTracker = new NonceTrackerSubprovider();
        wallet.engine._providers.unshift(nonceTracker);
        nonceTracker.setEngine(wallet.engine);
        return wallet;
      },
      network_id: 97,
      confirmations: 2,
      timeoutBlocks: 2000,
      networkCheckTimeout: 1000000000,
      skipDryRun: true,
    },
    bsc: {
      provider: function () {
        const wallet = new HDWalletProvider(
          secrets.bsc.mnemonic,
          secrets.bsc.rpcURL
        );
        const nonceTracker = new NonceTrackerSubprovider();
        wallet.engine._providers.unshift(nonceTracker);
        nonceTracker.setEngine(wallet.engine);
        return wallet;
      },
      network_id: 56,
      confirmations: 20,
      timeoutBlocks: 2000,
      networkCheckTimeout: 1000000000,
      skipDryRun: true,
    },
    cronos: {
      provider: function () {
        const wallet = new HDWalletProvider(
          secrets.cronos.mnemonic,
          secrets.cronos.rpcURL
        );
        const nonceTracker = new NonceTrackerSubprovider();
        wallet.engine._providers.unshift(nonceTracker);
        nonceTracker.setEngine(wallet.engine);
        return wallet;
      },
      network_id: 25,
      confirmations: 1,
      timeoutBlocks: 2000,
      networkCheckTimeout: 1000000000,
      skipDryRun: true,
    },
    avax: {
      provider: function () {
        const wallet = new HDWalletProvider(
          secrets.avax.mnemonic,
          secrets.avax.rpcURL
        );
        const nonceTracker = new NonceTrackerSubprovider();
        wallet.engine._providers.unshift(nonceTracker);
        nonceTracker.setEngine(wallet.engine);
        return wallet;
      },
      network_id: '*',
      confirmations: 1,
      skipDryRun: true,
    }
  },
  compilers: {
    solc: {
      version: "0.8.9",
      settings: {          // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 99999
        },
      }
    },
  },
  plugins: ["truffle-plugin-verify"],
  api_keys: {
    bscscan: secrets.bsc.explorerApiKEy,
    etherscan: secrets.kovan.explorerApiKEy,
    polygonscan: secrets.polygon.explorerApiKEy,
    snowtrace: secrets.avax.explorerApiKEy
  },
};
