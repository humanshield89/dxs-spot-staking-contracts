const config = require('./configs.js');
const LockedStakingFarm = artifacts.require("LockedStakingFarm");
const BUSDMOCK = artifacts.require("BUSDMOCK");
const USDTMOCK = artifacts.require("USDTMOCK");
const ERC20Mock9 = artifacts.require("ERC20Mock9Decimals");

const {toWei} = web3.utils;


module.exports = async function (deployer, network, addresses) {
  
  if(network === "kovan") {
    
    await deployer.deploy(
      LockedStakingFarm,
      '0x5967338dc055E9fcaa342812608C7EbC8571104d',
      addresses[0],
    );
  }
  else if (network === 'bsc'){
    await deployer.deploy(
      LockedStakingFarm,
      config.bsc.rewardToken,
      addresses[0],
    );
  }
  else if (network === 'chrono'){
    await deployer.deploy(
      LockedStakingFarm,
      config.bsc.rewardToken,
      config.bsc.owner,
      config.bsc.feeCollector      
    );
  }
  
};
