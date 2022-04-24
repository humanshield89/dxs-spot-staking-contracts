const Farm = artifacts.require("./LockedStakingFarm.sol");
const rewardToken = artifacts.require("./test/ERC20Mock.sol");
const NormalLP = artifacts.require("./test/LPMock.sol");
const DeflationLP = artifacts.require("./test/DeflationERC20Mock.sol");
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

contract("Farm All", ([owner, alice, bob, carl,]) => {
  before(async () => {
    this.owner = {};
    this.alice = {};
    this.bob = {};
    this.carl = {};
    
    this.rewardToken = await rewardToken.new("Mock token", "MOCK", 1000000);
    let balance = await this.rewardToken.balanceOf(owner);
    assert.equal(balance.valueOf(), 1000000);

    this.lp = await NormalLP.new("LP Token", "LP");
    this.lp2 = await DeflationLP.new("LP Token 2", "LP2");

    this.startTime = await getCurrentTime() + 100;

    this.farm = await Farm.new(this.rewardToken.address, owner, owner);

    this.pools = [];

    await this.farm.addPool(this.lp.address,15,0,0,0);
    this.totalMultiplier = 15;
    this.pools.push({
        mul: 15
    });

    await this.farm.addPool(this.lp2.address,15,0,0,0);
    this.totalMultiplier += 15;
    this.pools.push({
      mul: 15
    });

    await this.rewardToken.approve(this.farm.address, 10000);
    await this.farm.fund(10000);
    this.totalFunded = 10000;
    await this.farm.setStartTime(this.startTime);
  });

  before(async () => {
    await Promise.all([
      this.lp.mint(alice, 10000),
      this.lp.approve(this.farm.address, 10000, { from: alice }),

      this.lp.mint(bob, 10000),
      this.lp.approve(this.farm.address, 10000, { from: bob }),

      this.lp.mint(carl, 10000),
      this.lp.approve(this.farm.address, 10000, { from: carl }),

      this.lp2.mint(alice, 10000),
      this.lp2.approve(this.farm.address, 10000, { from: alice }),

      this.lp2.mint(bob, 10000),
      this.lp2.approve(this.farm.address, 10000, { from: bob }),

      this.lp2.mint(carl, 10000),
      this.lp2.approve(this.farm.address, 10000, { from: carl }),
    ]);
    this.alice.lpBalance = 10000;
    this.bob.lpBalance = 10000;
    this.carl.lpBalance = 10000;

    this.alice.lp2Balance = 10000;
    this.bob.lp2Balance = 10000;
    this.carl.lp2Balance = 10000;

    let [balanceAlice, balanceBob, balanceCarl] = await Promise.all([
      this.lp.balanceOf(alice),
      this.lp.balanceOf(bob),
      this.lp.balanceOf(carl),
    ]);

    assert.equal(this.alice.lpBalance, balanceAlice);
    assert.equal(this.bob.lpBalance, balanceBob);
    assert.equal(this.carl.lpBalance, balanceCarl);

    
    [balanceAlice, balanceBob, balanceCarl] = await Promise.all([
      this.lp.balanceOf(alice),
      this.lp.balanceOf(bob),
      this.lp.balanceOf(carl),
    ]);

    assert.equal(this.alice.lp2Balance, balanceAlice);
    assert.equal(this.bob.lp2Balance, balanceBob);
    assert.equal(this.carl.lp2Balance, balanceCarl);
  });

  describe("when created", () => {
    it("is linked to the Mock rewardToken token", async () => {
      const linked = await this.farm.rewardToken();
      assert.equal(linked, this.rewardToken.address);
    });

    it("is configured to reward 100 MOCK per block", async () => {
      this.rewardsPerSecond = 100;
      await this.farm.changeRewardPerSecond(this.rewardsPerSecond);
      const rewardPerBlock = await this.farm.rewardPerSecond();
      assert.equal(rewardPerBlock, this.rewardsPerSecond);
    });

    it("is configured with the correct start block", async () => {
      const startTime = await this.farm.startTime();
      assert.equal(startTime, this.startTime);
    });

    it("is initialized for the LP token", async () => {
      const poolLength = await this.farm.poolLength();
      assert.equal(2, poolLength);

      const poolInfo = await this.farm.poolInfo(0);
      assert.equal(poolInfo[0], this.lp.address);
      assert.equal(poolInfo[1].words[0], 15);

      const totalAllocPoint = await this.farm.totalMultiplier();
      assert.equal(totalAllocPoint, 30);
    });


    it("is initialized for the LP2 token", async () => {
      const poolLength = await this.farm.poolLength();
      assert.equal(2, poolLength);

      const poolInfo = await this.farm.poolInfo(1);
      assert.equal(poolInfo[0], this.lp2.address);
      assert.equal(poolInfo[1].words[0], 15);

      const totalAllocPoint = await this.farm.totalMultiplier();
      assert.equal(totalAllocPoint, 30);
    });

    it("holds 10,000 MOCK", async () => {
      const balance = await this.rewardToken.balanceOf(this.farm.address);
      assert.equal(balance, this.totalFunded);
    });

    it("will run for 100 seconds", async () => {
      const endBlock = await this.farm.endTime();
      assert.equal(100, endBlock - this.startTime);
    });
  });

  describe("before the start block", () => {
    before(async () => {
      this.alice.lpDeposit = 3000;
      this.bob.lpDeposit = 1000;
      this.alice.lpBalance -= 3000;
      this.bob.lpBalance -= 1000;
      await Promise.all([
        this.farm.stakeInPool(0, 3000, { from: alice }),
        this.farm.stakeInPool(0, 1000, { from: bob }), // bob at deposited [0]
      ]);
    });

    it("allows participants to join", async () => {
      const balanceFarm = await this.lp.balanceOf(this.farm.address);
      assert.equal(this.alice.lpDeposit + this.bob.lpDeposit, balanceFarm);

      const balanceAlice = await this.lp.balanceOf(alice);
      const depositAlice = await this.farm.totalDeposited(0, alice);
      assert.equal(this.alice.lpBalance, balanceAlice);
      assert.equal(this.alice.lpDeposit, depositAlice);

      const balanceBob = await this.lp.balanceOf(bob);
      const depositBob = await this.farm.totalDeposited(0, bob);
      assert.equal(this.bob.lpBalance, balanceBob);
      assert.equal(this.bob.lpDeposit, depositBob);
    });

    it("does not assign any rewards yet", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(0, totalPending);
    });
  });

  describe("after 10 seconds of farming", () => {
    before(async () => {
        await advanceTimeTo(this.startTime+10);
    });

    it("has a total reward of 1000 MOCK pending", async () => {
      this.totalPending =  await this.farm.totalPending();
      const deltaTime = await getElapsedTime(this.startTime);
      assert.equal(this.rewardsPerSecond * deltaTime, this.totalPending);
    });

    it("reserved the right amount of rewards for alice and bob", async () => {
      const pendingAlice = await this.farm.pending(0, alice);
      
      assert.equal(Math.trunc((this.pools[0].mul / this.totalMultiplier) * this.totalPending * this.alice.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit)), pendingAlice);

      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(Math.trunc((this.pools[0].mul / this.totalMultiplier) * this.totalPending * this.bob.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit)), pendingBob);
    });
  });
  
  describe("with a 3th participant after 30 seconds", () => {
    before(async () => {
      await advanceTimeTo(this.startTime + 30);
      await this.farm.stakeInPool(0, 3000, { from: carl });  // deposits[0]
      this.carl.lpBalance -= 3000;
      this.carl.lpDeposit = 3000;
      this.carl.joinTime1 = await getCurrentTime();
      await this.farm.stakeInPool(0, 1000, { from: carl });  // deposits[1]
      this.carl.lpBalance -= 1000;
      this.carl.lpDeposit += 1000;
      this.carl.joinTime2 = await getCurrentTime();
    });

    it("has the correct total reward pending", async () => {
      const diff =await getElapsedTime(this.startTime);
      console.log('diff = '+ diff)
      const rewards = diff * this.rewardsPerSecond;
      this.totalPending = await this.farm.totalPending();
      assert.equal(rewards, this.totalPending);
    });

    it("reserved the right rewards for alice, bob, and carl", async () => {
      this.alice.share = this.alice.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit);
      this.alice.pending = await this.farm.pending(0, alice);
      const diff = await getElapsedTime(this.startTime);
      console.log('diff = '+ diff)
      assert.equal(Math.trunc(Number((this.pools[0].mul / this.totalMultiplier) * this.totalPending * this.alice.share)), this.alice.pending);

      this.bob.share = this.bob.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit);
      this.bob.pending = await this.farm.pending(0, bob);
      assert.equal(Math.trunc((this.pools[0].mul / this.totalMultiplier) * this.totalPending * this.bob.share), this.bob.pending);

      this.carl.pending = await this.farm.pending(0, carl);
      assert.equal(0, this.carl.pending);
      this.distributedRewards = this.totalPending;
      this.lastTime = Number(await getCurrentTime());
    });
  });

  describe("after 50 seconds of farming", () => {
    before(async () => {
      await advanceTimeTo(this.startTime + 50);
      //advanceBlockAtTime(Number(this.startTime)+50);
    });

    it("has the right total reward pending", async () => {
      const diff =await getElapsedTime(this.startTime);
      const rewards = diff * this.rewardsPerSecond;
      this.totalPending = Number(await this.farm.totalPending());
      assert.equal(rewards, this.totalPending);
      
    });

    it("reserved the right amount of rewards for alice, for bob, and for carl", async () => {

      const rewards = this.totalPending - this.distributedRewards;
      const diff = await getElapsedTime(this.startTime + this.lastTime);

      const poolRatio = this.pools[0].mul / this.totalMultiplier;
      this.alice.share = this.alice.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingAlice = await this.farm.pending(0, alice);
      this.alice.pending = Number(this.alice.pending) + (Number(this.alice.share) * Number(rewards) * poolRatio);
      assert.equal(Math.trunc(this.alice.pending), pendingAlice); // 713 = (100 * 1500/4000)*19 

      this.bob.share = this.bob.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingBob = await this.farm.pending(0, bob);
      this.bob.pending = Number(this.bob.pending) + (Number(this.bob.share) * Number(rewards) * poolRatio);
      assert.equal(Math.trunc(this.bob.pending), pendingBob);

      
      this.carl.share = this.carl.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingCarl = await this.farm.pending(0, carl);
      this.carl.pending = Number(this.carl.pending) + (Number(this.carl.share) * Number(rewards) * poolRatio);
      assert.equal( Math.trunc(this.carl.pending), pendingCarl);

      this.distributedRewards = this.totalPending;
    });
  });
  
  describe("with a participant withdrawing after 70 seconds", () => {
    before(async () => {
      await advanceTimeTo(this.startTime + 70);
    });

    it("reserved the right amount of rewards for alice, for bob, and for carl", async () => {
      this.totalPending =  Number(await this.farm.totalPending());

      const rewards = this.totalPending - this.distributedRewards;
      const diff = await getElapsedTime(this.startTime + this.lastTime);

      const poolRatio = this.pools[0].mul / this.totalMultiplier;
      this.alice.share = this.alice.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingAlice = await this.farm.pending(0, alice);
      this.alice.pending = Number(this.alice.pending) + (Number(this.alice.share) * Number(rewards) * poolRatio);
      assert.equal(Math.trunc(this.alice.pending), pendingAlice); // 713 = (100 * 1500/4000)*19 

      this.bob.share = this.bob.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingBob = await this.farm.pending(0, bob);
      this.bob.pending = Number(this.bob.pending) + (Number(this.bob.share) * Number(rewards) * poolRatio);
      assert.equal(Math.trunc(this.bob.pending), pendingBob);

      
      this.carl.share = this.carl.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingCarl = await this.farm.pending(0, carl);
      this.carl.pending = Number(this.carl.pending) + (Number(this.carl.share) * Number(rewards) * poolRatio);
      assert.equal( Math.trunc(this.carl.pending), pendingCarl);

      this.distributedRewards = this.totalPending;
      console.log('this.totalPending = '+this.totalPending)
    });

    it('alice can withdraw' , async () => {
      await this.farm.withdrawUnlockedDeposit(0, 0, { from: alice }); // unstake 3000
      this.alice.lpBalance += 3000;
      this.alice.lpDeposit -= 3000;
      this.alice.lpClaimed = this.alice.pending;
      this.alice.pending = 0;
      this.totalClaimed =  this.alice.lpClaimed;
    })

    it("reserved the right amount of rewards for alice, for bob, and for carl", async () => {
      this.totalPending =  Number(await this.farm.totalPending());
      console.log('this.totalPending = '+this.totalPending)

      const rewards = (this.totalPending)  - (this.distributedRewards - this.totalClaimed);
      const diff = await getElapsedTime(this.startTime + this.lastTime);
      const timeDiff = await getElapsedTime(this.startTime);

      //assert.equal(rewards , timeDiff * this.rewardsPerSecond);

      const poolRatio = this.pools[0].mul / this.totalMultiplier;
      this.alice.share = this.alice.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingAlice = await this.farm.pending(0, alice);
      this.alice.pending = Number(this.alice.pending) + (Number(this.alice.share) * Number(rewards) * poolRatio);
      assert.equal(Math.trunc(this.alice.pending), pendingAlice);

      this.bob.share = this.bob.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingBob = await this.farm.pending(0, bob);
      this.bob.pending = Number(this.bob.pending) + (Number(this.bob.share) * Number(rewards) * poolRatio);
      assert.equal(Math.trunc(this.bob.pending), pendingBob);

      
      this.carl.share = this.carl.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingCarl = await this.farm.pending(0, carl);
      this.carl.pending = Number(this.carl.pending) + (Number(this.carl.share) * Number(rewards) * poolRatio);
      assert.equal( Math.trunc(this.carl.pending), pendingCarl);

      this.distributedRewards = this.totalPending;
    });

    it("gives alice 3755 MOCK and 1500 LP", async () => {
      const balanceERC20 = await this.rewardToken.balanceOf(alice);
      assert.equal(this.alice.lpClaimed, balanceERC20);

      const balanceLP = await this.lp.balanceOf(alice);
      assert.equal(this.alice.lpBalance, balanceLP);
    });

    it("has no deposit for alice", async () => {
      const deposited = await this.farm.totalDeposited(0, alice);
      assert.equal(0, deposited);
    });

    it("has a total reward of 3203 MOCK pending", async () => {
      const totalPending = await this.farm.totalPending();
      const diff = await getElapsedTime(this.startTime);
      this.totalPending = this.rewardsPerSecond * diff - this.totalClaimed;
      assert.equal(this.totalPending, totalPending); // (7000  |100(token/second)*70(seconds) = 7000 token|) - (3750 claimed by alice )
    });
  });
  
  describe("with a participant partially withdrawing after 80 blocks", () => {
    before(async () => {
      await time.increaseTo(this.startTime + 80);
      // // widraw deposit deposit[0]
    });


    it("reserved the right amount of rewards for alice, for bob, and for carl", async () => {
      this.totalPending =  Number(await this.farm.totalPending());

      const rewards = this.totalPending - this.distributedRewards;

      const poolRatio = this.pools[0].mul / this.totalMultiplier;
      this.alice.share = this.alice.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingAlice = await this.farm.pending(0, alice);
      this.alice.pending = Number(this.alice.pending) + (Number(this.alice.share) * Number(rewards) * poolRatio);
      assert.equal(Math.trunc(this.alice.pending), pendingAlice); // 713 = (100 * 1500/4000)*19 

      this.bob.share = this.bob.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingBob = await this.farm.pending(0, bob);
      this.bob.pending = Number(this.bob.pending) + (Number(this.bob.share) * Number(rewards) * poolRatio);
      assert.equal(Math.trunc(this.bob.pending), pendingBob);

      
      this.carl.share = this.carl.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingCarl = await this.farm.pending(0, carl);
      this.carl.pending = Number(this.carl.pending) + (Number(this.carl.share) * Number(rewards) * poolRatio);
      assert.equal( Math.trunc(this.carl.pending), pendingCarl);

      this.distributedRewards = this.totalPending;
      console.log('this.totalPending = '+this.totalPending)
      this.lastTime = await getCurrentTime();
    });

    it('alice can withdraw' , async () => {
      await this.farm.withdrawUnlockedDeposit(0, 0, { from: carl }); // 3000
      const poolRatio = this.pools[0].mul / this.totalMultiplier;

      const rewards = this.rewardsPerSecond * ((await getCurrentTime())-this.lastTime);
      this.carl.share = this.carl.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const carlclaim = this.carl.pending + (rewards * poolRatio * this.carl.share);
      //console.log('rewards = '+rewards);
    //  console.log('carlclaim = '+carlclaim);
      this.carl.lpBalance += 3000;
      this.carl.lpDeposit -= 3000;
      this.carl.lpClaimed = Math.trunc(carlclaim);
      this.carl.pending = 0;
      this.totalClaimed +=  this.carl.lpClaimed;
    })

    it("gives carl 2800 MOCK and 1500 LP", async () => {
      const balanceERC20 = await this.rewardToken.balanceOf(carl);
      assert.equal(this.carl.lpClaimed, balanceERC20);

      const balanceLP = await this.lp.balanceOf(carl);
      assert.equal(this.carl.lpBalance, balanceLP);
    });

    it("has a 500 LP deposit for carl", async () => {
      const deposited = await this.farm.totalDeposited(0, carl);
      assert.equal(this.carl.lpDeposit, deposited);
    });

    it("has a total reward of 1450 MOCK pending", async () => {
      const diff = await getElapsedTime(this.startTime);
      console.log(' this.totalClaimed = '+ this.totalClaimed)
      const rewards = diff * this.rewardsPerSecond - this.totalClaimed;
      this.totalPending = await this.farm.totalPending();
      assert.equal(Math.trunc(rewards), this.totalPending);
    });

    it("reserved the right amount of rewards for alice, for bob, and for carl", async () => {
      this.totalPending =  Number(await this.farm.totalPending());


      const diff = await getElapsedTime(this.lastTime);

      const rewards = (this.totalPending)  - (this.distributedRewards - this.carl.lpClaimed);
      console.log('rewards = '+rewards)


      const poolRatio = this.pools[0].mul / this.totalMultiplier;
      this.alice.share = this.alice.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingAlice = await this.farm.pending(0, alice);
      this.alice.pending = Number(this.alice.pending) + (Number(this.alice.share) * Number(rewards) * poolRatio);
      assert.equal(Math.trunc(this.alice.pending), pendingAlice);

      this.bob.share = this.bob.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);

      const pendingBob = await this.farm.pending(0, bob);
      this.bob.pending = Number(this.bob.pending) + (Number(this.bob.share) * Number(rewards) * poolRatio);
      assert.equal(Math.trunc(this.bob.pending), pendingBob);

      
      this.carl.share = this.carl.lpDeposit / (this.alice.lpDeposit + this.bob.lpDeposit+ this.carl.lpDeposit);
      const pendingCarl = await this.farm.pending(0, carl);
      this.carl.pending = Number(this.carl.pending) + (Number(this.carl.share) * Number(rewards) * poolRatio);
      assert.equal( Math.trunc(this.carl.pending), pendingCarl);

      this.distributedRewards = this.totalPending;
    });
  });
  
  describe("is safe", () => {
    it("won't allow alice to withdraw", async () => {
      await truffleAssert.reverts(
        this.farm.withdrawUnlockedDeposit(0, 0, { from: alice }) // should fail 
      );
    });

    it("won't allow carl to withdraw more than his deposit", async () => {
      const deposited = await this.farm.totalDeposited(0, carl);
      assert.equal(this.carl.lpDeposit, deposited);

      await truffleAssert.reverts(
        this.farm.withdrawUnlockedDeposit(0, 1, { from: carl })
      );
    });
  });

  describe("when it receives more funds (8000 MOCK)", () => {
    before(async () => {
      await this.rewardToken.approve(this.farm.address, 8000);
      await this.farm.fund(8000);
      this.totalFunded += 8000;
    });

    it("runs for 180 blocks (80 more)", async () => {
      const endTime = await this.farm.endTime();
      assert.equal(180, endTime - this.startTime);
    });
  });


  describe('end farming' , async () => {

    it("Fails if not owner" , async () => {
      const endTime = await this.farm.endTime();

      await truffleAssert.reverts(
        this.farm.setEndTime(endTime - 80, { from: carl }),
        'Ownable: caller is not the owner'
      );
    });

    it("Fails if time bigger" , async () => {
      const endTime = await this.farm.endTime();

      await truffleAssert.reverts(
        this.farm.setEndTime(endTime + 1, { from: owner }),
        "can't extend the farm without funding"
      );
    });

    it("end the farm before time, and receives the rewards" , async () => {
      const balanceBefore = await this.rewardToken.balanceOf(owner);
      const endTime = await this.farm.endTime();

      await this.farm.setEndTime(endTime - 80, { from: owner });
      const balanceAfter = await this.rewardToken.balanceOf(owner);

      assert.equal(balanceAfter-balanceBefore , 80 * this.rewardsPerSecond);

    });
  });
  /*
  describe("with an added lp token (for 25%) after 100 blocks", () => {
    before(async () => {
      let currentBlock = await web3.eth.getBlockNumber();
      let time = (await web3.eth.getBlock(currentBlock)).timestamp;
      let diff = Number(this.startTime)-Number(time) + 99
      await wait(diff);
      currentBlock = await web3.eth.getBlockNumber();
      time = (await web3.eth.getBlock(currentBlock)).timestamp;
      diff = Number(time) - Number(this.startTime);
      if(diff < 100){
        await wait(100-diff);
      }
      await this.farm.addPool(5, this.lp2.address,0,0,0,0);
    });

    it("has a total reward of 3450 MOCK pending", async () => {
      const currentBlock = await web3.eth.getBlockNumber();
      const time = (await web3.eth.getBlock(currentBlock)).timestamp;
      assert.equal(time - (await this.farm.startTime()), 100);

      const totalPending = await this.farm.totalPending();
      assert.equal(3450, totalPending.toNumber());
    });

    it("is initialized for the LP token 2", async () => {
      const poolLength = await this.farm.poolLength();
      assert.equal(2, poolLength);

      const poolInfo = await this.farm.poolInfo(1);
      assert.equal(poolInfo[0], this.lp2.address);
      assert.equal(poolInfo[1].words[0], 5);

      const totalAllocPoint = await this.farm.totalMultiplier();
      assert.equal(totalAllocPoint, 20);
    });

    it("reserved nothing for alice, 2450 for bob, and 1000 for carl", async () => {
      const pendingAlice = await this.farm.pending(0, alice);
      assert.equal(0, pendingAlice);

      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(2450, pendingBob);

      const pendingCarl = await this.farm.pending(0, carl);
      assert.equal(1000, pendingCarl);
    });
  });

  describe("with 1st participant for lp2 after 110 blocks", () => {
    before(async () => {
      let currentBlock = await web3.eth.getBlockNumber();
      let time = (await web3.eth.getBlock(currentBlock)).timestamp;
      let diff = Number(this.startTime)-Number(time) + 109
      await wait(diff);
      currentBlock = await web3.eth.getBlockNumber();
      time = (await web3.eth.getBlock(currentBlock)).timestamp;
      diff = Number(time) - Number(this.startTime);
      if(diff < 110){
        await wait(110-diff);
      }
      await this.lp2.approve(this.farm.address, 1000, { from: carl });
      await this.farm.stakeInPool(1, 400, { from: carl });  // deposit at pool 1 at index [0]
      await this.farm.stakeInPool(1, 600, { from: carl })  // deposit at pool 1 at index [1] claims 25 at the same time
    });

    it("holds 1000 LP for the participants", async () => {
      const balanceFarm = await this.lp.balanceOf(this.farm.address);
      assert.equal(1000, balanceFarm);

      const depositAlice = await this.farm.totalDeposited(0, alice);
      assert.equal(0, depositAlice);

      const depositBob = await this.farm.totalDeposited(0, bob);
      assert.equal(500, depositBob);

      const depositCarl = await this.farm.totalDeposited(0, carl);
      assert.equal(500, depositCarl);
    });

    it("holds 500 LP2 for the participants", async () => {
      const balanceFarm = await this.lp2.balanceOf(this.farm.address);
      assert.equal(500, balanceFarm);

      const depositAlice = await this.farm.totalDeposited(1, alice);
      assert.equal(0, depositAlice);

      const depositBob = await this.farm.totalDeposited(1, bob);
      assert.equal(0, depositBob);

      const depositCarl = await this.farm.totalDeposited(1, carl);
      assert.equal(500, depositCarl);
    });

    it("has a total reward of 4450 MOCK pending", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(4450, totalPending);
    });

    it("reserved 75% for LP (50/50 bob/carl)", async () => {
      const pendingAlice = await this.farm.pending(0, alice);
      assert.equal(0, pendingAlice);

      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(2825, pendingBob);

      const pendingCarl = await this.farm.pending(0, carl);
      assert.equal(1375, pendingCarl);
    });

    it("reserved 25% for LP2 (not rewarded) -> 250 MOCK inaccessible", async () => {
      const pendingAlice = await this.farm.pending(1, alice);
      assert.equal(0, pendingAlice);

      const pendingBob = await this.farm.pending(1, bob);
      assert.equal(0, pendingBob);

      const pendingCarl = await this.farm.pending(1, carl);
      assert.equal(0, pendingCarl);
    });
  });

  describe("with 2nd participant for lp2 after 120 blocks", () => {
    before(async () => {
      let currentBlock = await web3.eth.getBlockNumber();
      let time = (await web3.eth.getBlock(currentBlock)).timestamp;
      let diff = Number(this.startTime)-Number(time) + 118
      await wait(diff);
      currentBlock = await web3.eth.getBlockNumber();
      time = (await web3.eth.getBlock(currentBlock)).timestamp;
      diff = Number(time) - Number(this.startTime);
      if(diff < 120){
        await wait(120-diff);
      }
      await this.lp2.approve(this.farm.address, 2000, { from: alice });
      await this.farm.stakeInPool(1, 2000, { from: alice });
    });

    it("holds 1500 LP2 for the participants", async () => {
      const balanceFarm = await this.lp2.balanceOf(this.farm.address);
      assert.equal(1500, balanceFarm);

      const depositAlice = await this.farm.totalDeposited(1, alice);
      assert.equal(1000, depositAlice);

      const depositBob = await this.farm.totalDeposited(1, bob);
      assert.equal(0, depositBob);

      const depositCarl = await this.farm.totalDeposited(1, carl);
      assert.equal(500, depositCarl);
    });

    it("has a total reward of 5450 MOCK pending", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(5450, totalPending);
    });

    it("reserved 75% for LP with 3200 for bob and 1750 for carl", async () => {
      const pendingAlice = await this.farm.pending(0, alice);
      assert.equal(0, pendingAlice);

      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(3200, pendingBob);

      const pendingCarl = await this.farm.pending(0, carl);
      assert.equal(1750, pendingCarl);
    });

    it("reserved 25% for LP2 with 250 for carl", async () => {
      const pendingAlice = await this.farm.pending(1, alice);
      assert.equal(0, pendingAlice);

      const pendingBob = await this.farm.pending(1, bob);
      assert.equal(0, pendingBob);

      const pendingCarl = await this.farm.pending(1, carl);
      assert.equal(250, pendingCarl);
    });
  });

  describe("after 140 seconds of farming", () => {
    before(async () => {
      let currentBlock = await web3.eth.getBlockNumber();
      let time = (await web3.eth.getBlock(currentBlock)).timestamp;
      let diff = Number(this.startTime)-Number(time) + 139
      await wait(diff);
      currentBlock = await web3.eth.getBlockNumber();
      time = (await web3.eth.getBlock(currentBlock)).timestamp;
      diff = Number(time) - Number(this.startTime);
      if(diff < 140){
        await wait(140-diff);
      }
    });

    it("has a total reward of 7450 MOCK pending", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(7450, totalPending);
    });

    it("reserved 75% for LP with 3950 for bob and 2500 for carl", async () => {
      const pendingAlice = await this.farm.pending(0, alice);
      assert.equal(0, pendingAlice);

      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(3950, pendingBob);

      const pendingCarl = await this.farm.pending(0, carl);
      assert.equal(2500, pendingCarl);
    });

    it("reserved 25% for LP2 with 333 for alice and 416 for carl", async () => {
      const pendingAlice = await this.farm.pending(1, alice);
      assert.equal(333, pendingAlice);

      const pendingBob = await this.farm.pending(1, bob);
      assert.equal(0, pendingBob);

      const pendingCarl = await this.farm.pending(1, carl);
      assert.equal(416, pendingCarl);
    });
  });

  describe("with a participant partially withdrawing LP2 after 150 blocks", () => {
    let balanceBefore;
    before(async () => {
      let currentBlock = await web3.eth.getBlockNumber();
      let time = (await web3.eth.getBlock(currentBlock)).timestamp;
      let diff = Number(this.startTime)-Number(time) + 149
      await wait(diff)
      currentBlock = await web3.eth.getBlockNumber();
      time = (await web3.eth.getBlock(currentBlock)).timestamp;
      diff = Number(time) - Number(this.startTime);
      if(diff < 150){
        await wait(150-diff);
      }
      const pendingCarl = await this.farm.pending(1, carl);
      assert.equal(500, pendingCarl);
      balanceBefore = await  await this.rewardToken.balanceOf(carl);
      await this.farm.withdrawUnlockedDeposit(1, 0, { from: carl }); // should be 200 + rewards 
    });

    it("gives carl 500 MOCK and 200 LP", async () => {
      const balanceERC20 = await this.rewardToken.balanceOf(carl);
      assert.equal(500,balanceERC20-balanceBefore);

      const balanceLP = await this.lp2.balanceOf(carl);
      assert.equal(700, balanceLP);
    });

    it("has a total reward of 7950 MOCK pending", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(7950, totalPending);
    });

    it("reserved 75% for LP with 4325 for bob and 2875 for carl", async () => {
      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(4325, pendingBob);

      const pendingCarl = await this.farm.pending(0, carl);
      assert.equal(2875, pendingCarl);
    });

    it("reserved 25% for LP2 with 500 for alice and nothing for carl", async () => {
      const pendingAlice = await this.farm.pending(1, alice);
      assert.equal(500, pendingAlice);

      const pendingCarl = await this.farm.pending(1, carl);
      assert.equal(0, pendingCarl);
    });

    it("holds 1000 LP for the participants", async () => {
      const balanceFarm = await this.lp.balanceOf(this.farm.address);
      assert.equal(1000, balanceFarm);

      const depositBob = await this.farm.totalDeposited(0, bob);
      assert.equal(500, depositBob);

      const depositCarl = await this.farm.totalDeposited(0, carl);
      assert.equal(500, depositCarl);
    });

    it("holds 1300 LP2 for the participants", async () => {
      const balanceFarm = await this.lp2.balanceOf(this.farm.address);
      assert.equal(1300, balanceFarm);

      const depositAlice = await this.farm.totalDeposited(1, alice);
      assert.equal(1000, depositAlice);

      const depositCarl = await this.farm.totalDeposited(1, carl);
      assert.equal(300, depositCarl);
    });
  });

  describe("with a participant doing an emergency withdraw LP2 after 160 blocks", () => {
    before(async () => {
      let currentBlock = await web3.eth.getBlockNumber();
      let time = (await web3.eth.getBlock(currentBlock)).timestamp;
      let diff = Number(this.startTime)-Number(time) + 159
      await wait(diff);
      currentBlock = await web3.eth.getBlockNumber();
      time = (await web3.eth.getBlock(currentBlock)).timestamp;
      diff = Number(time) - Number(this.startTime);
      if(diff < 160){
        await wait(160-diff);
      }
    });

    it('Fails to emergency withdraw when not paused', async () => {
        await truffleAssert.reverts(
          this.farm.emergencyWithdraw(1, { from: carl }),
          "Pausable: not paused"
        );
    });
    let balanceERC20Before;

    it('It does not fail to emergency withdraw when paused', async() => {
      balanceERC20Before = await this.rewardToken.balanceOf(carl);
      await this.farm.pause();

      await this.farm.emergencyWithdraw(1, { from: carl });
      await this.farm.unPause();
    });

    it("gives carl 850 LP", async () => {
      const balanceLP = await this.lp2.balanceOf(carl);
      assert.equal(850, balanceLP);
    });

    it("gives carl no MOCK", async () => {
      const balanceERC20 = await this.rewardToken.balanceOf(carl);
      assert.equal(0, balanceERC20-balanceERC20Before);
    });

    it("holds no LP2 for carl", async () => {
      const depositCarl = await this.farm.totalDeposited(1, carl);
      assert.equal(0, depositCarl);
    });

    it("has no reward for carl", async () => {
      const pendingCarl = await this.farm.pending(1, carl);
      assert.equal(0, pendingCarl);
    });

    it("holds 1000 LP2 for alice", async () => {
      const balanceFarm = await this.lp2.balanceOf(this.farm.address);
      assert.equal(1000, balanceFarm);

      const depositAlice = await this.farm.totalDeposited(1, alice);
      assert.equal(1000, depositAlice);
    });

    it("has 750 MOCK pending for alice (receives bobs share)", async () => {
      const pendingAlice = await this.farm.pending(1, alice);
      assert.equal(750, pendingAlice);
    });
  });

  describe("when closed after 180 blocks", () => {
    before(async () => {
      let currentBlock = await web3.eth.getBlockNumber();
      let time = (await web3.eth.getBlock(currentBlock)).timestamp;
      let diff = Number(this.startTime)-Number(time) + 179
      await wait(diff);
      currentBlock = await web3.eth.getBlockNumber();
      time = (await web3.eth.getBlock(currentBlock)).timestamp;
      diff = Number(time) - Number(this.startTime);
      if(diff < 180){
        await wait(180-diff);
      }
    });

    it("has a total reward of 10950 MOCK pending", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(10950, totalPending);
    });

    it("reserved 75% for LP with 5450 for bob and 2875 for carl", async () => {
      const pendingAlice = await this.farm.pending(0, alice);
      assert.equal(0, pendingAlice);

      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(5450, pendingBob);

      const pendingCarl = await this.farm.pending(0, carl);
      assert.equal(4000, pendingCarl);
    });

    it("reserved 25% for LP2 with 1250 for alice", async () => {
      const pendingAlice = await this.farm.pending(1, alice);
      assert.equal(1250, pendingAlice);

      const pendingBob = await this.farm.pending(1, bob);
      assert.equal(0, pendingBob);

      const pendingCarl = await this.farm.pending(1, carl);
      assert.equal(0, pendingCarl);
    });
  });

  describe("when closed for 20 blocks (after 200 blocks)", () => {
    before(async () => {
      let currentBlock = await web3.eth.getBlockNumber();
      let time = (await web3.eth.getBlock(currentBlock)).timestamp;
      let diff = Number(this.startTime)-Number(time) + 199
      await wait(diff);
      currentBlock = await web3.eth.getBlockNumber();
      time = (await web3.eth.getBlock(currentBlock)).timestamp;
      diff = Number(time) - Number(this.startTime);
      if(diff < 199){
        await wait(199-diff);
      }
    });

    it("still has a total reward of 10950 MOCK pending", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(10950, totalPending);
    });

    it("has a pending reward for LP 5450 for bob and 4000 for carl", async () => {
      const pendingAlice = await this.farm.pending(0, alice);
      assert.equal(0, pendingAlice);

      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(5450, pendingBob);

      const pendingCarl = await this.farm.pending(0, carl);
      assert.equal(4000, pendingCarl);
    });

    it("has a pending reward for LP2 with 1250 for alice", async () => {
      const pendingAlice = await this.farm.pending(1, alice);
      assert.equal(1250, pendingAlice);

      const pendingBob = await this.farm.pending(1, bob);
      assert.equal(0, pendingBob);

      const pendingCarl = await this.farm.pending(1, carl);
      assert.equal(0, pendingCarl);
    });

    it("will not accept new funds", async () => {
      await truffleAssert.reverts(
        this.farm.fund(10000),
        "fund: too late, the farm is closed"
      );
    });
  });

  describe("with participants withdrawing after closed", async () => {
    before(async () => {
      await this.farm.withdrawUnlockedDeposit(1, 0, { from: alice });
      await this.farm.withdrawUnlockedDeposit(0, 0, { from: bob });
      await this.farm.withdrawUnlockedDeposit(0, 0, { from: carl });
    });

    it("gives alice 1250 MOCK and 1000 LP2", async () => {
      const balanceERC20 = await this.rewardToken.balanceOf(alice);
      assert.equal(5000, balanceERC20);

      const balanceLP = await this.lp.balanceOf(alice);
      assert.equal(7750, balanceLP);

      const balanceLP2 = await this.lp2.balanceOf(alice);
      assert.equal(500, balanceLP2);
    });

    it("gives carl 5450 MOCK and 500 LP", async () => {
      const balanceERC20 = await this.rewardToken.balanceOf(bob);
      assert.equal(5450, balanceERC20);

      const balanceLP = await this.lp.balanceOf(bob);
      assert.equal(250, balanceLP);
    });

    it("gives carl 4000 MOCK and 500 LP", async () => {
      const balanceERC20 = await this.rewardToken.balanceOf(carl);
      assert.equal(7300, balanceERC20);

      const balanceLP = await this.lp.balanceOf(carl);
      assert.equal(1000, balanceLP);

      const balanceLP2 = await this.lp2.balanceOf(carl);
      assert.equal(850, balanceLP2);
    });

    it("has an end balance of 250 MOCK, which is lost forever", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(250, totalPending);

      const balanceFarm = await this.rewardToken.balanceOf(this.farm.address);
      assert.equal(250, balanceFarm);
    });

    it("has no pending reward for LP", async () => {
      const pendingAlice = await this.farm.pending(0, alice);
      assert.equal(0, pendingAlice);

      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(0, pendingBob);

      const pendingCarl = await this.farm.pending(0, carl);
      assert.equal(0, pendingCarl);
    });

    it("has no pending reward for LP2", async () => {
      const pendingAlice = await this.farm.pending(1, alice);
      assert.equal(0, pendingAlice);

      const pendingBob = await this.farm.pending(1, bob);
      assert.equal(0, pendingBob);

      const pendingCarl = await this.farm.pending(1, carl);
      assert.equal(0, pendingCarl);
    });
    
  });
  */
});