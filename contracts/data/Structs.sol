// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// Info of each user.
struct UserInfo {
    uint256 amount; // How many LP tokens the user has provided.
    uint256 rewardDebt; // Reward debt. See explanation below.
    uint256[] deposits; // indexes of deposits belonging to this user
}

// each user deposit is saved in an object like this
struct DepositInfo {
    uint256 amount;
    uint256 depositTime;
}

// Info of each pool.
struct PoolInfo {
    IERC20 lpToken; // Address of LP token contract.
    uint256 multiplier; // How many allocation points assigned to this pool
    uint256 lastRewardTime; // Last time where ERC20s distribution occurs.
    uint256 accERC20PerShare; // Accumulated ERC20s per share, times 1e36.
    uint256 stakedAmount; // Amount of @lpToken staked in this pool
    uint256 stakeFee; // fee on staking percentage
    uint256 lockPeriod; // lock period in days
    uint256 penalty; // percentage penalty for early unstake
}
