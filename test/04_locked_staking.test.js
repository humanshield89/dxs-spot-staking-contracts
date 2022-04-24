const BEP20 = artifacts.require('./test/ERC20Mock.sol');
const LP = artifacts.require('./test/LPMock.sol');

const {toWei} = web3.utils;


const Farm = artifacts.require("./LockedStakingFarm.sol");
const rewardToken = artifacts.require("./test/ERC20Mock.sol");
const { wait } = require("./helpers/tempo")(web3);
const truffleAssert = require("truffle-assertions");
const { expectRevert, time } = require("@openzeppelin/test-helpers");

const advanceBlockAtTime = (time) => {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send(
        {
          jsonrpc: "2.0",
          method: "evm_mine",
          params: [time],
          id: new Date().getTime(),
        },
        (err, _) => {
          if (err) {
            return reject(err);
          }
          const newBlockHash = web3.eth.getBlock("latest").hash;
  
          return resolve(newBlockHash);
        },
      );
    });
  };
  
  const getElapsedTime = async (startTime) => {
    const currentBlock = await web3.eth.getBlockNumber();
    const time = (await web3.eth.getBlock(currentBlock)).timestamp;
    return time - startTime;
  }
  
  const advanceTimeTo = async (targetTime) => {
    let currentBlock = await web3.eth.getBlockNumber();
    let currTime = (await web3.eth.getBlock(currentBlock)).timestamp;
    await time.increase(targetTime-currTime)
    //await wait(targetTime-currTime);
  }
  
  const getCurrentTime = async () => {
    const currentBlock = await web3.eth.getBlockNumber();
    return (await web3.eth.getBlock(currentBlock)).timestamp;
  }
  

contract('Farm Locked staking', ([owner, alice, bob, carl, adminWallet, adminWallet2]) => {
    before(async () => {
        this.bep20 = await BEP20.new("Mock token", "MOCK", toWei('1000000000'));
        let balance = await this.bep20.balanceOf(owner);
        assert.equal(balance.valueOf(), toWei('1000000000'));

        this.lp = await LP.new("LP Token", "LP");
        this.lp2 = await LP.new("LP Token 2", "LP2");

        const currTime = await getCurrentTime();
        this.startTime = currTime + 100;

        this.farm = await Farm.new(this.bep20.address,owner, adminWallet);
        await this.farm.addPool(
            this.lp.address, //lpToken_,
            15, //allocPoint_,
            50,//deposit fee,
            100, //lockPeriodInDays_, 100 days 
            5, //early unstake fee,
        );

        await this.bep20.approve(this.farm.address, toWei('5000000'));
        await this.farm.fund(toWei('5000000'));
        await this.farm.setStartTime(this.startTime);
        await this.farm.changeRewardPerSecond(toWei('100'));
    });

    before(async () => {
        await Promise.all([
            this.lp.mint(alice, toWei('10000')),
            this.lp.mint(bob, toWei('1000')),
            this.lp.mint(carl, toWei('4000')),
        ]);

        const [balanceAlice, balanceBob, balanceCarl] = await Promise.all([
            this.lp.balanceOf(alice),
            this.lp.balanceOf(bob),
            this.lp.balanceOf(carl),
        ]);

        assert.equal(toWei('10000'), balanceAlice);
        assert.equal(toWei('1000'), balanceBob);
        assert.equal(toWei('4000'), balanceCarl);
    });

    before(async () => {
        await Promise.all([
            this.lp2.mint(alice, toWei('2000')),
            this.lp2.mint(carl, toWei('1600')),
        ]);

        const [balanceAlice, balanceBob, balanceCarl] = await Promise.all([
            this.lp2.balanceOf(alice),
            this.lp2.balanceOf(bob),
            this.lp2.balanceOf(carl),
        ]);

        assert.equal(toWei('2000'), balanceAlice);
        assert.equal(toWei('0'), balanceBob);
        assert.equal(toWei('1600'), balanceCarl);
    });

    describe('when created', () => {

        it('is initialized for the LP token', async () => {
            /*
                IERC20 lpToken; // Address of LP token contract.
                uint256 multiplier; // How many allocation points assigned to this pool
                uint256 lastRewardTime; // Last time where ERC20s distribution occurs.
                uint256 accERC20PerShare; // Accumulated ERC20s per share, times 1e36.
                uint256 stakedAmount; // Amount of @lpToken staked in this pool
                uint256 stakeFee; // fee on staking percentage
                uint256 lockPeriod; // lock period in days
                uint256 penalty; // percentage penalty for early unstake
            */
            const poolLength = await this.farm.poolLength();
            assert.equal(1, poolLength);

            const poolInfo = await this.farm.poolInfo(0);
            assert.equal(poolInfo[0], this.lp.address);
            assert.equal(poolInfo[1].words[0], 15);
            assert.equal(poolInfo[6].words[0], 100);
            assert.equal(poolInfo[5].words[0], 50);
            assert.equal(poolInfo[7].words[0], 5);

            const totalAllocPoint = await this.farm.totalMultiplier();
            assert.equal(totalAllocPoint, 15);
        });

        it('holds 5000000 MOCK', async () => {
            const balance = await this.bep20.balanceOf(this.farm.address);
            assert.equal(balance, toWei('5000000'))
        });

        it('will run for 50000 blocks', async () => {
            const endTime = await this.farm.endTime();
            assert.equal(50000, endTime - this.startTime);
        });
    });

    describe('before the start block', () => {

        it('Allows participants to join', async () => {
            await Promise.all([
                this.lp.approve(this.farm.address, toWei('3000'), {from: alice}),
                this.lp.approve(this.farm.address, toWei('1000'), {from: bob})
            ]);

            const balanceBefore = await this.lp.balanceOf(adminWallet);

            await this.farm.stakeInPool(0, toWei('1000'), {from: alice})
            
            await this.farm.stakeInPool(0, toWei('200'), {from: bob})

            await this.farm.stakeInPool(0, toWei('800'), {from: alice})
            await this.farm.stakeInPool(0, toWei('1200'), {from: alice})

            await this.farm.stakeInPool(0, toWei('200'), {from: bob})
            await this.farm.stakeInPool(0, toWei('200'), {from: bob})
            await this.farm.stakeInPool(0, toWei('200'), {from: bob})
            await this.farm.stakeInPool(0, toWei('200'), {from: bob})
        
            const balanceAfter = await this.lp.balanceOf(adminWallet);
            assert.equal(toWei('2000'), balanceAfter-balanceBefore);


            const balanceFarm = await this.lp.balanceOf(this.farm.address);
            assert.equal(toWei('2000'), balanceFarm);

            const balanceAlice = await this.lp.balanceOf(alice);
            const depositAlice = await this.farm.totalDeposited(0, alice);
            assert.equal(toWei('7000'), balanceAlice);
            assert.equal(toWei('1500'), depositAlice);

            const balanceBob = await this.lp.balanceOf(bob);
            const depositBob = await this.farm.totalDeposited(0, bob);
            assert.equal(toWei('0'), balanceBob);
            assert.equal(toWei('500'), depositBob);
        });

        it('Does not assign any rewards yet', async () => {
            const totalPending = await this.farm.totalPending();
            assert.equal(0, totalPending);
        });

        it("5 deposits for Bob and 3 for Alice ", async () => {
            const aliceDeposits = await this.farm.getUserDeposits(0,alice);
            assert.equal(aliceDeposits.length, 3);
            

            const bobDeposits = await this.farm.getUserDeposits(0,bob);
            assert.equal(bobDeposits.length, 5);
        });

        it('has the right user infos ', async () => {
            const aliceInfo = await this.farm.getUserInfo(0, alice);
            assert.equal(Number(aliceInfo[2][0]), 0);
            assert.equal(Number(aliceInfo[2][1]), 2);
            assert.equal(Number(aliceInfo[2][2]), 3);

            const bobInfo = await this.farm.getUserInfo(0, bob);
            assert.equal(Number(bobInfo[2][0]), 1);
            assert.equal(Number(bobInfo[2][1]), 4);
            assert.equal(Number(bobInfo[2][2]), 5);
            assert.equal(Number(bobInfo[2][3]), 6);
            assert.equal(Number(bobInfo[2][4]), 7);
        });

        it('has valid deposits', async () => {
            let deposit = await this.farm.usersDeposits(0);
            assert.equal(deposit[0] ,  toWei('500'));
            //assert.equal(deposit[1] ,  100*24*60*60);

            deposit = await this.farm.usersDeposits(1);
            assert.equal(deposit[0] ,  toWei('100'));
            //assert.equal(deposit[1] ,  100*24*60*60);

            deposit = await this.farm.usersDeposits(2);
            assert.equal(deposit[0] ,  toWei('400'));
            //assert.equal(deposit[1] ,  100*24*60*60);

            deposit = await this.farm.usersDeposits(3);
            assert.equal(deposit[0] ,  toWei('600'));
            //assert.equal(deposit[1] ,  100*24*60*60);

            deposit = await this.farm.usersDeposits(4);
            assert.equal(deposit[0] ,  toWei('100'));
            //assert.equal(deposit[1] ,  100*24*60*60);

            deposit = await this.farm.usersDeposits(5);
            assert.equal(deposit[0] ,  toWei('100'));
            //assert.equal(deposit[1] ,  100*24*60*60);

            deposit = await this.farm.usersDeposits(6);
            assert.equal(deposit[0] ,  toWei('100'));
            //assert.equal(deposit[1] ,  100*24*60*60);

            deposit = await this.farm.usersDeposits(7);
            assert.equal(deposit[0] ,  toWei('100'));
            //assert.equal(deposit[1] ,  100*24*60*60);
        });
    });

    describe('early unstake' , async ()=> {

        it('should revert when trying to unstake wrong index' , async () => {
            await truffleAssert.reverts(
                 this.farm.withdrawUnlockedDeposit(0, 5, {from: bob})
            )
        });

        it('should prevent early unstake' , async () => {
            await truffleAssert.reverts(
                 this.farm.withdrawUnlockedDeposit(0, 4, {from: bob}),
                 "withdraw: can't withdraw deposit before unlock time"
            )
        });

        it('should allow early unstake for a penalty', async () => {
            const bobBalanceBefore = await this.lp.balanceOf(bob);
            const adminBalanceBefore = await this.lp.balanceOf(adminWallet);

            await this.farm.unstakeWithPenalty(0,0,{from: bob});

            const bobBalance = await this.lp.balanceOf(bob);
            const adminBalance = await this.lp.balanceOf(adminWallet);

            assert.equal(bobBalance-bobBalanceBefore, toWei('95'));
            assert.equal(adminBalance-adminBalanceBefore, toWei('5'));

            const depositBob = await this.farm.totalDeposited(0, bob);
            assert.equal(toWei('400'), depositBob);
        });
    });

    describe('after unlock period' , async () => {
        before(async () => {
            await time.increaseTo( this.startTime + 100 * 24 * 60 * 60);
        });

        it('should not allow widrawal with penalty', async () => {
            await truffleAssert.reverts(
                this.farm.unstakeWithPenalty(0,0,{from: bob}),
                "unstakeWithPenalty: unlocked!"
            );
        });

        it('should set paused', async() => {
            await this.farm.pause();
            assert.equal(await this.farm.paused(), true);
        });

        it('should not let bob deposit', async () => {
            truffleAssert.reverts(
                this.farm.stakeInPool(0,0, {from: bob}),
                'Pausable: paused'
            )
        });

        it('should let bob emergency widraw', async () => {
            await this.farm.emergencyWithdraw(0,{from: bob});
            const bobInfo = await this.farm.getUserInfo(0, bob);
            assert.equal(bobInfo[2].length, 0);
            assert.equal(bobInfo[0], 0);
        });
    });
});