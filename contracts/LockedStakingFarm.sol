// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

import "./utils/SafeERC20.sol";
import "./interfaces/IFarm.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./utils/CustomOwnable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
    Locked farm with deposit and early widthrawal fees 
 */

contract LockedStakingFarm is CustomOwnable, Pausable, IFarm {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 constant DAY_IN_SECONDS = 24 * 60 * 60;

    // Address of the ERC20 Token contract.
    IERC20 public immutable rewardToken;
    // total amount of reward token funded to this contract
    uint256 public totalERC20Rewards;
    // The total amount of ERC20 that's paid out as reward.
    uint256 public paidOut;
    // amount of rewardToken distributed per Second.
    uint256 public rewardPerSecond;

    // time when the last rewardPerSecond has changed
    uint256 public lastEmissionChange;
    // all pending rewards before last rewards per second change
    uint256 public rewardsAmountBeforeLastChange;

    // Info of each pool.
    PoolInfo[] public poolInfo;

    // userInfo
    // index => userDeposit info
    mapping(uint256 => DepositInfo) public usersDeposits;
    uint256 private _depositsLength;

    // Info of each user that stakes LP tokens.
    // poolId => user => userInfoId's
    mapping(uint256 => mapping(address => UserInfo)) usersInfos;

    // Total Multiplier. Must be the sum of all Multipliers in all pools.
    uint256 public totalMultiplier;

    // The time when farming starts.
    uint256 public startTime;

    // The time when farming ends.
    uint256 public endTime;

    //fee wallet's address
    address public feeCollector;

    constructor(IERC20 rewardTokenAddress_,address owner_, address feeCollector_) CustomOwnable(owner_){
        rewardToken = rewardTokenAddress_;
        feeCollector = feeCollector_;
    }

    function setStartTime(uint256 epochTimestamp_) external onlyOwner {
        require(startTime == 0 || block.timestamp < startTime);
        uint256 duration = endTime - startTime;
        startTime = epochTimestamp_;

        //pool.lastRewardTime = startTime;
        for (uint256 i = 0; i < poolInfo.length; i++) {
            poolInfo[i].lastRewardTime = startTime;
        }
        lastEmissionChange = startTime;

        endTime = duration < type(uint256).max
            ? epochTimestamp_ + duration
            : duration;
    }

    /**
        in case where the owner wants to end the farm early and recover the rewards funded
     */
    function setEndTime(uint256 epochTimestamp_) external onlyOwner {
        require(
            epochTimestamp_ < endTime,
            "can't extend the farm without funding"
        );
        uint256 left;

        if (rewardPerSecond == 0) {
            left = totalERC20Rewards - _totalPastRewards();
        } else {
            uint256 secondsToNewEnd = epochTimestamp_ - block.timestamp;
            uint256 rewards = rewardPerSecond.mul(secondsToNewEnd);
            left = totalERC20Rewards - _totalPastRewards() - rewards;
        }
        endTime = epochTimestamp_;

        _transferRewardToken(msg.sender, left, false);
        totalERC20Rewards -= left;
    }

    /**
        @dev Pauses the contract stoping deposits and widrawals and opens emergency widrawals that will ignore penalty and forfeit the rewards 
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
        @dev unpause the contracts
     */
    function unPause() external onlyOwner {
        _unpause();
    }

    /**
        @dev change feeCollector (the one that receives the fees) 
        this address have no control in this farm it is only used
        to send fees collected
        @param newfeeCollector_ the new fee wallet address
    */
    function changefeeCollector(address newfeeCollector_)
        external
        override
        onlyOwner
    {
        require(
            newfeeCollector_ != address(0),
            "changefeeCollector: can't be zero address"
        );
        feeCollector = newfeeCollector_;
    }

    /**
        @dev Fund the farm, increases the endTime, keep in mind that this function expect you to have aproved this ammount
        @param amount_ Amount of rewards token to fund (will be transfered from the caller's balance)
     */
    function fund(uint256 amount_) external override onlyOwner {
        // avoid precision loss only transfer what is devidable by rewardsPerSecond
        require(
            block.timestamp < endTime || startTime == endTime,
            "fund: too late, the farm is closed"
        );
        uint256 leftOver;

        if (rewardPerSecond != 0) {
            leftOver = amount_.mod(rewardPerSecond);
        }

        uint256 balanceBefore = rewardToken.balanceOf(address(this));

        rewardToken.transferFrom(
            address(msg.sender),
            address(this),
            amount_.sub(leftOver)
        );

        uint256 diff = rewardToken.balanceOf(address(this)) - balanceBefore;
        require(amount_.sub(leftOver) == diff, "Farm: detected fee on tx");
        
        endTime += rewardPerSecond > 0
            ? diff.div(rewardPerSecond)
            : type(uint256).max;

        totalERC20Rewards += diff;
    }

    /**
        @dev Add a new pool to the farm. Can only be called by the owner.
        @param multiplier_ pool multiplier
        @param lpToken_ The address of the token that will be stake in this pool
        @param depositFee_ percentage of the deposit as fee (this will apply directly when people stake on their capital )  
        @param lockPeriodInDays_ The amount of days this pool locks the stake put 0 for no lock
        @param earlyUnlockPenalty_ The percentage that will be taken as penalty for early unstake
     */

    function addPool(
        IERC20 lpToken_,
        uint256 multiplier_,
        uint256 depositFee_,
        uint256 lockPeriodInDays_,
        uint256 earlyUnlockPenalty_
    ) external override onlyOwner {
        require(
            earlyUnlockPenalty_ < 100,
            "earlyUnlockPenaltyPercentage_ should be < 100"
        );
        massUpdatePools();

        uint256 lastRewardTime = block.timestamp > startTime
            ? block.timestamp
            : startTime;
        totalMultiplier = totalMultiplier.add(multiplier_);
        poolInfo.push(
            PoolInfo({
                lpToken: lpToken_,
                multiplier: multiplier_,
                lastRewardTime: lastRewardTime,
                accERC20PerShare: 0,
                stakedAmount: 0,
                stakeFee: depositFee_,
                lockPeriod: lockPeriodInDays_, // lock period in days
                penalty: earlyUnlockPenalty_
            })
        );
        uint256 pid = poolInfo.length-1;
        emit PoolCreated(pid, address(lpToken_));
        emit MultiplierUpdates(pid, 0, multiplier_);
    }

    /**
        @dev Update the given pool's multiplier X.
        @param poolId_ pool id (index of the pool)
        @param multiplier_ new multiplier to be assigned to this pool
     */
    function updateMultiplier(uint256 poolId_, uint256 multiplier_)
        external
        override
        onlyOwner
    {
        massUpdatePools();
        
        emit MultiplierUpdates(poolId_, poolInfo[poolId_].multiplier, multiplier_);

        totalMultiplier = totalMultiplier.sub(poolInfo[poolId_].multiplier).add(
                multiplier_
            );
        poolInfo[poolId_].multiplier = multiplier_;
    }

    /**
        @dev Update reward variables for all pools. Be careful of gas spending!
     */
    function massUpdatePools() public override {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    /**
        Update reward variables of the given pool to be up-to-date.
        @param poolPid_ pool index
     */
    function updatePool(uint256 poolPid_) public override {
        uint256 lastTime = block.timestamp < endTime
            ? block.timestamp
            : endTime;
        uint256 lastRewardTime = poolInfo[poolPid_].lastRewardTime;

        if (lastTime <= lastRewardTime) {
            return;
        }

        uint256 lpSupply = poolInfo[poolPid_].stakedAmount;
        if (lpSupply == 0 || totalMultiplier == 0) {
            poolInfo[poolPid_].lastRewardTime = lastTime;
            return;
        }

        uint256 erc20Reward = lastTime
            .sub(lastRewardTime)
            .mul(rewardPerSecond)
            .mul(poolInfo[poolPid_].multiplier)
            .div(totalMultiplier);

        poolInfo[poolPid_].accERC20PerShare = poolInfo[poolPid_]
            .accERC20PerShare
            .add(erc20Reward.mul(1e36).div(lpSupply));

        poolInfo[poolPid_].lastRewardTime = lastTime;
    }

    /**
        Deposit LP tokens to Pool for
        @param poolPid_ pool index
        @param amount_ amount to be deposited (this contract should be aproved before hand)
     */
    function stakeInPool(uint256 poolPid_, uint256 amount_)
        external
        override
        whenNotPaused
    {
        //PoolInfo storage pool = poolInfo[poolPid_];
        uint256 amount = usersInfos[poolPid_][msg.sender].amount;
        IERC20 lpToken = poolInfo[poolPid_].lpToken;
        uint256 fee = poolInfo[poolPid_].stakeFee;
        //UserInfo storage user = usersInfos[poolPid_][msg.sender];
        updatePool(poolPid_);

        if (amount > 0) {
            // claim  rewards without updating debt we update debt after updating user and pool with the new deposit
            _claimPending(poolPid_, msg.sender);
        }

        if (amount_ > 0) {
            // take deposit fee
            uint256 depositFee;
            if (fee > 0) {
                depositFee = amount_.mul(poolInfo[poolPid_].stakeFee).div(100);
                lpToken.safeTransferFrom(msg.sender, feeCollector, depositFee);
                emit PaidStakeFee(msg.sender, poolPid_, depositFee);
            }
            // transfer
            uint256 balanceBefore = lpToken.balanceOf(address(this));
            lpToken.safeTransferFrom(
                msg.sender,
                address(this),
                amount_.sub(depositFee)
            );
            uint256 netDeposit = lpToken.balanceOf(address(this)).sub(
                balanceBefore
            );
            // update pool's info
            poolInfo[poolPid_].stakedAmount += netDeposit;
            // update user's info
            amount = amount.add(netDeposit);
            uint256 length = _depositsLength;
            usersInfos[poolPid_][msg.sender].deposits.push(length);
            usersDeposits[length] = DepositInfo(
                netDeposit, //amount;
                block.timestamp //depositTime;
            );

            emit Deposit(msg.sender, poolPid_, netDeposit);
            _depositsLength = length + 1;
        }

        // user has claimed all pending reward so lets reflect that in his info
        usersInfos[poolPid_][msg.sender].rewardDebt = amount
            .mul(poolInfo[poolPid_].accERC20PerShare)
            .div(1e36);
        usersInfos[poolPid_][msg.sender].amount = amount;
    }

    /**
        unstake a deposit that is unlocked 
        @param poolPid_ pool index
        @param userDepositIndex_ deposit index in usersInfos[poolPid_][msg.sender].deposits
     */
    function withdrawUnlockedDeposit(
        uint256 poolPid_,
        uint256 userDepositIndex_
    ) external override whenNotPaused {
        uint256 amount = usersDeposits[
            usersInfos[poolPid_][msg.sender].deposits[userDepositIndex_]
        ].amount;
        require(
            usersDeposits[
                usersInfos[poolPid_][msg.sender].deposits[userDepositIndex_]
            ].depositTime +
                DAY_IN_SECONDS *
                poolInfo[poolPid_].lockPeriod <=
                block.timestamp,
            "withdraw: can't withdraw deposit before unlock time"
        );

        updatePool(poolPid_);

        // claim
        _claimPending(poolPid_, msg.sender);
        // end claim

        poolInfo[poolPid_].lpToken.safeTransfer(address(msg.sender), amount);

        emit Withdraw(msg.sender, poolPid_, amount);

        _removeDeposit(poolPid_, msg.sender, userDepositIndex_);
    }

    /**
        Withdraw without caring about rewards and lock penalty  . EMERGENCY ONLY.
     */
    function emergencyWithdraw(uint256 poolPid_) external override whenPaused {
        //UserInfo storage user = usersInfos[poolPid_][msg.sender];
        uint256 amount = usersInfos[poolPid_][msg.sender].amount;

        poolInfo[poolPid_].lpToken.safeTransfer(address(msg.sender), amount);
        emit EmergencyWithdraw(msg.sender, poolPid_, amount);
        poolInfo[poolPid_].stakedAmount = poolInfo[poolPid_].stakedAmount.sub(
            amount
        );

        uint256 length = usersInfos[poolPid_][msg.sender].deposits.length;

        for (uint256 i = 0; i < length; i++) {
            delete usersDeposits[usersInfos[poolPid_][msg.sender].deposits[i]]; // refunds gas
        }

        delete usersInfos[poolPid_][msg.sender]; // refunds gas
    }

    /**
        @dev instake with a penalty 
     */
    function unstakeWithPenalty(uint256 poolPid_, uint256 userDepositIndex_)
        external
        override
        whenNotPaused
    {
        uint256 amount = usersDeposits[
            usersInfos[poolPid_][msg.sender].deposits[userDepositIndex_]
        ].amount;
        require(
            usersDeposits[
                usersInfos[poolPid_][msg.sender].deposits[userDepositIndex_]
            ].depositTime +
                DAY_IN_SECONDS *
                poolInfo[poolPid_].lockPeriod >
                block.timestamp,
            "unstakeWithPenalty: unlocked!"
        );

        updatePool(poolPid_);

        // claim pending rewards
        _claimPending(poolPid_, msg.sender);
        // end claim

        uint256 penaltyAmount = amount.mul(poolInfo[poolPid_].penalty).div(100);

        // send tokens to user
        IERC20 lpToken = poolInfo[poolPid_].lpToken;
        lpToken.safeTransfer(address(msg.sender), amount.sub(penaltyAmount));
        // send adminShare to feeCollector
        if (penaltyAmount > 0)
            lpToken.safeTransfer(feeCollector, penaltyAmount);
        // distribute LP on stakers

        _removeDeposit(poolPid_, msg.sender, userDepositIndex_);

        emit WithdrawWithPenalty(msg.sender, poolPid_, amount.sub(penaltyAmount));
        emit PaidEarlyPenalty(msg.sender, poolPid_, penaltyAmount);
    }

    /**
        @dev recover any ERC20 tokens sent by mistake or recover rewards 
        after all farms have ended and all users have unstaked
        technically can be called while farming is still active
        owner can in no way take users staked token or rewards
    */
    function recoverTokens(IERC20 tokenAddresss_, address to_)
        external
        override
        onlyOwner
    {
        // check if this _erc20 has pools and users are still staked in those pools
        uint256 userStakeLeft;
        for (uint256 i = 0; i < poolInfo.length; i++) {
            if (poolInfo[i].lpToken == tokenAddresss_)
                userStakeLeft += poolInfo[i].stakedAmount;
        }

        // if
        if (tokenAddresss_ == rewardToken) {
            require(block.timestamp > endTime, "Farming is not ended yet.");
            userStakeLeft += totalPending();
        }

        // only transfer the amount not belonging to users
        uint256 amount = tokenAddresss_.balanceOf(address(this)) -
            userStakeLeft;
        if (amount > 0) tokenAddresss_.transfer(to_, amount);
    }

    /**
        Changes the rewardPerSecond reducing the rewards will make the endTime go further into the future and reduced the APY 
        increasing this will make the endTime closer and will increase APY 
        to prevent accidental ending of the farm if the rewardsPerSecond increase will put the endTime closer than a day away it will revert
        @param rewardPerSecond_ new rewards per second
     */
    function changeRewardPerSecond(uint256 rewardPerSecond_)
        external
        override
        onlyOwner
    {
        require(block.timestamp < endTime, "Too late farming ended");
        uint256 totalRewardsTillNow = _totalPastRewards();
        uint256 leftRewards = totalERC20Rewards - totalRewardsTillNow;
        uint256 newLeftBlocks = rewardPerSecond_ > 0
            ? leftRewards.div(rewardPerSecond_)
            : type(uint256).max;
        uint256 leftoverRewards = rewardPerSecond_ > 0
            ? leftRewards.mod(rewardPerSecond_)
            : 0;
        uint256 newEndBlock = rewardPerSecond_ > 0
            ? block.timestamp > startTime
                ? block.timestamp + newLeftBlocks
                : startTime + newLeftBlocks
            : type(uint256).max;

        
        if (rewardPerSecond_ > rewardPerSecond)
            require(
                newEndBlock > block.timestamp,
                "rewards are not sufficient"
            );

        massUpdatePools();

        // push this change into history
        if (block.timestamp >= startTime) {
            lastEmissionChange = block.timestamp;
            rewardsAmountBeforeLastChange = totalRewardsTillNow;
        }

        endTime = newEndBlock;
        uint256 oldRewardsPerSecond = rewardPerSecond;
        rewardPerSecond = rewardPerSecond_;
        // send any excess rewards to fee (caused by rewards % rewardperSecond != 0) to prevent precision loss
        if (leftoverRewards > 0) {
            // this is not a payout hence the 'false'
            _transferRewardToken(feeCollector, leftoverRewards, false);
            totalERC20Rewards -= leftoverRewards;
        }
        emit RewardsPerSecondChanged(rewardPerSecond , oldRewardsPerSecond);
    }

    /**
        @dev view function returns the userInfo for the given user at the given poolId
        @param poolPid_ pool index
        @param user_ user wallet address 
        
    */
    function getUserInfo(uint256 poolPid_, address user_)
        external
        view
        override
        returns (UserInfo memory)
    {
        return usersInfos[poolPid_][user_];
    }

    /** 
      @dev Number of LP pools
    */
    function poolLength() external view override returns (uint256) {
        return poolInfo.length;
    }

    /** 
        @dev View function to see a user's stake in a pool.
        @param poolId_ pool id (index)
        @param user_ user's wallet address
    */
    function totalDeposited(uint256 poolId_, address user_)
        external
        view
        override
        returns (uint256)
    {
        UserInfo storage user = usersInfos[poolId_][user_];
        return user.amount;
    }

    /**
        @dev View function to see all deposits for a user in a staking pool this iss used to display on UIs.
        @param poolId_ pool id (index)
        @param user_ user's wallet address
    */
    function getUserDeposits(uint256 poolId_, address user_)
        external
        view
        override
        returns (DepositInfo[] memory)
    {
        UserInfo storage user = usersInfos[poolId_][user_];
        DepositInfo[] memory userDeposits = new DepositInfo[](
            user.deposits.length
        );

        for (uint8 i = 0; i < user.deposits.length; i++) {
            userDeposits[i] = usersDeposits[user.deposits[i]];
        }

        return userDeposits;
    }

    /**
        View function to see pending ERC20 rewards for a user.
        @param poolId_ pool id (index)
        @param user_ user's wallet address
    */
    function pending(uint256 poolId_, address user_)
        external
        view
        override
        returns (uint256)
    {
        PoolInfo storage pool = poolInfo[poolId_];
        UserInfo storage user = usersInfos[poolId_][user_];
        uint256 accERC20PerShare = pool.accERC20PerShare;
        uint256 lpSupply = pool.stakedAmount;

        if (block.timestamp > pool.lastRewardTime && lpSupply != 0) {
            uint256 lastTime = block.timestamp < endTime
                ? block.timestamp
                : endTime;
            uint256 nrOfBlocks = lastTime.sub(pool.lastRewardTime);
            uint256 erc20Reward = nrOfBlocks
                .mul(rewardPerSecond)
                .mul(pool.multiplier)
                .div(totalMultiplier);
            accERC20PerShare = accERC20PerShare.add(
                erc20Reward.mul(1e36).div(lpSupply)
            );
        }

        return user.amount.mul(accERC20PerShare).div(1e36).sub(user.rewardDebt);
    }

    /**
       @dev View function for total reward the farm has yet to pay out.
    */
    function totalPending() public view override returns (uint256) {
        if (block.timestamp <= startTime) {
            return 0;
        }
        return _totalPastRewards().sub(paidOut);
    }

    /**
        remove a deposit from memory and change the state accordingly
        @param poolPid_ pool index
        @param user_ user wallet address
        @param userDepositIndex_ user deposit index in usersInfos[poolPid_][user_].deposits
    */
    function _removeDeposit(
        uint256 poolPid_,
        address user_,
        uint256 userDepositIndex_
    ) internal {
        uint256 depositAmount = usersDeposits[
            usersInfos[poolPid_][user_].deposits[userDepositIndex_]
        ].amount;
        uint256 amount = usersInfos[poolPid_][user_].amount;

        amount = amount.sub(depositAmount);
        poolInfo[poolPid_].stakedAmount = poolInfo[poolPid_].stakedAmount.sub(
            depositAmount
        );

        delete usersDeposits[
            usersInfos[poolPid_][user_].deposits[userDepositIndex_]
        ]; // refunds gas for zeroing a non zero field

        if (amount > 0) {
            usersInfos[poolPid_][user_].rewardDebt = amount
                .mul(poolInfo[poolPid_].accERC20PerShare)
                .div(1e36);

            usersInfos[poolPid_][user_].deposits[
                userDepositIndex_
            ] = usersInfos[poolPid_][user_].deposits[
                usersInfos[poolPid_][user_].deposits.length - 1
            ];
            usersInfos[poolPid_][user_].deposits.pop();
            usersInfos[poolPid_][user_].amount = amount;
        } else {
            // if this user has no more deposits delete his entry in the mapping (refunds gas for zeroing non zero field)
            delete usersInfos[poolPid_][msg.sender];
        }
    }

    /**
        @dev claimed pending for user (in case of extending this function and using it somewhere else please remember to recalculate the rewards debt for this user)
        @param poolPid_ pool index
        @param user_ user wallet address 
     */
    function _claimPending(uint256 poolPid_, address user_) internal {
        //PoolInfo storage pool = poolInfo[poolPid_];

        uint256 amount = usersInfos[poolPid_][user_].amount;
        uint256 pendingAmount = amount
            .mul(poolInfo[poolPid_].accERC20PerShare)
            .div(1e36)
            .sub(usersInfos[poolPid_][user_].rewardDebt);
        if (pendingAmount > 0) {
            _transferRewardToken(msg.sender, pendingAmount, true);
            emit ClaimRewards(user_, poolPid_, pendingAmount);
        }
    }

    /**
        helper function for changing rewards per block
    */
    function _totalPastRewards() internal view returns (uint256) {
        if (block.timestamp < startTime) return 0;

        uint256 lastTime = block.timestamp < endTime
            ? block.timestamp
            : endTime;

        return
            rewardsAmountBeforeLastChange.add(
                rewardPerSecond.mul(lastTime - lastEmissionChange)
            );
    }

    /** 
        @dev Transfer ERC20 and update the required ERC20 to payout all rewards
        @param to_ address to send to
        @param amount_ amount to be sent 
        @param isPayout_ is this is a payout or not (prcession loss and token recovery use this too)
    */
    function _transferRewardToken(
        address to_,
        uint256 amount_,
        bool isPayout_
    ) internal {
        rewardToken.safeTransfer(to_, amount_);
        if (isPayout_) paidOut += amount_;
    }
}