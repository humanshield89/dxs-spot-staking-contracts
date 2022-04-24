// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../data/Structs.sol";

interface IFarm {
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);

    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );

    event ClaimRewards(address indexed user, uint256 indexed pid, uint256 amount);

    event RewardsPerSecondChanged(
        uint256 oldRewardsPerSecond,
        uint256 newRewardsPerSecond
    );

    event PoolCreated(uint256 pid, address token);

    event MultiplierUpdates(
        uint256 indexed pid,
        uint256 oldMultiplier,
        uint256 newMultiplier
    );

    // Number of LP pools
    function poolLength() external view returns (uint256);

    function pause() external;

    function unPause() external;

    // Fund the farm, increase the end block
    function fund(uint256 amount_) external;

    // create a new Pool for LP
    function addPool(
        IERC20 lpToken_,
        uint256 multiplier_,
        uint256 lockPeriodInDays_
    ) external;

    // Update the given pool's ERC20 allocation point. Can only be called by the owner.
    function updateMultiplier(uint256 poolId_, uint256 allocPoint_) external;

    function totalDeposited(uint256 poolId_, address user_)
        external
        view
        returns (uint256);

    function getUserDeposits(uint256 poolId_, address user_)
        external
        view
        returns (DepositInfo[] memory);

    function pending(uint256 pid_, address user_) external view returns (uint256);

    function totalPending() external view returns (uint256);

    function massUpdatePools() external;

    function updatePool(uint256 pid_) external;

    function stakeInPool(uint256 poolPid_, uint256 amount_) external;

    function withdrawUnlockedDeposit(uint256 poolPid_, uint256 userDepositIndex_)
        external;

    function emergencyWithdraw(uint256 poolPid_) external;

    function recoverTokens(IERC20 _erc20, address _to) external;

    function changeRewardPerSecond(uint256 _rewardPerBlock) external;

    function getUserInfo(uint256 pid_, address user_)
        external
        view
        returns (UserInfo memory);
}
