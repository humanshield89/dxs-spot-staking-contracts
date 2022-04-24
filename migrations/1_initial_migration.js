const config = require('./configs.js');
const LockedStakingFarm = artifacts.require("LockedStakingFarm");
const BUSDMOCK = artifacts.require("BUSDMOCK");
const USDTMOCK = artifacts.require("USDTMOCK");
const ERC20Mock9 = artifacts.require("ERC20Mock9Decimals");

const {toWei} = web3.utils;


module.exports = async function (deployer, network, addresses) {
  
  if(network === "kovan") {
    
    await deployer.deploy(
      ERC20Mock9,
      'DX SPOT',
      'DXS',
      '1000000000000000000000000'
    );

    await deployer.deploy(
      USDTMOCK,
      'USDT',
      'Tether',
      '1000000000000000000000000'
    );

    await deployer.deploy(
      BUSDMOCK,
      'BUSD',
      'Binance USD',
      '1000000000000000000000000'
    );


    await deployer.deploy(
      LockedStakingFarm,
      ERC20Mock9.address,
      addresses[0],
      addresses[0]      
    );
  }
  else if (network === 'bsc'){
    await deployer.deploy(
      LockedStakingFarm,
      config.bsc.rewardToken,
      config.bsc.owner,
      config.bsc.feeCollector      
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
