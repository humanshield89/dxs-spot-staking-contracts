/*
const Farm = artifacts.require("./LockedStakingFarm.sol");
const ERC20 = artifacts.require("./test/ERC20Mock.sol");
const LP = artifacts.require("./test/LPMock.sol");
const { wait } = require("./helpers/tempo")(web3);
const truffleAssert = require("truffle-assertions");
const { expectRevert, time } = require("@openzeppelin/test-helpers");

contract("Farm", ([owner, alice, bob, carl]) => {
  before(async () => {
    this.erc20 = await ERC20.new("Mock token", "MOCK", 1000000);
    let balance = await this.erc20.balanceOf(owner);
    assert.equal(balance.valueOf(), 1000000);

    this.lp = await LP.new("LP Token", "LP");
    this.lp2 = await LP.new("LP Token 2", "LP2");

    const currentBlock = await web3.eth.getBlockNumber();
    const startTime = (await web3.eth.getBlock(currentBlock)).timestamp;
    this.startTime = startTime + 100; // in a day

    this.farm = await Farm.new(this.erc20.address, owner,owner);
    await this.farm.addPool(this.lp.address,15,0,0,0);

    await this.erc20.approve(this.farm.address, 10000);
    await this.farm.fund(10000);
    await this.farm.setStartTime(this.startTime);
  });

  before(async () => {
    await Promise.all([
      this.lp.mint(alice, 5000),
      this.lp.mint(bob, 500),
      this.lp.mint(carl, 2000),
    ]);

    const [balanceAlice, balanceBob, balanceCarl] = await Promise.all([
      this.lp.balanceOf(alice),
      this.lp.balanceOf(bob),
      this.lp.balanceOf(carl),
    ]);

    assert.equal(5000, balanceAlice);
    assert.equal(500, balanceBob);
    assert.equal(2000, balanceCarl);
  });

  before(async () => {
    await Promise.all([this.lp2.mint(alice, 1000), this.lp2.mint(carl, 800)]);

    const [balanceAlice, balanceBob, balanceCarl] = await Promise.all([
      this.lp2.balanceOf(alice),
      this.lp2.balanceOf(bob),
      this.lp2.balanceOf(carl),
    ]);

    assert.equal(1000, balanceAlice);
    assert.equal(0, balanceBob);
    assert.equal(800, balanceCarl);
  });

  describe("when created", () => {
    it("is linked to the Mock ERC20 token", async () => {
      const linked = await this.farm.rewardToken();
      assert.equal(linked, this.erc20.address);
    });

    it("is configured to reward 100 MOCK per block", async () => {
      await this.farm.changeRewardPerSecond(100);
      const rewardPerBlock = await this.farm.rewardPerSecond();
      assert.equal(rewardPerBlock, 100);
    });

    it("is configured with the correct start block", async () => {
      const startTime = await this.farm.startTime();
      assert.equal(startTime, this.startTime);
    });

    it("is initialized for the LP token", async () => {
      const poolLength = await this.farm.poolLength();
      assert.equal(1, poolLength);

      const poolInfo = await this.farm.poolInfo(0);
      assert.equal(poolInfo[0], this.lp.address);
      assert.equal(poolInfo[1].words[0], 15);

      const totalAllocPoint = await this.farm.totalMultiplier();
      assert.equal(totalAllocPoint, 15);
    });

    it("holds 10,000 MOCK", async () => {
      const balance = await this.erc20.balanceOf(this.farm.address);
      assert.equal(balance, 10000);
    });

    it("will run for 100 seconds", async () => {
      const endBlock = await this.farm.endTime();
      assert.equal(100, endBlock - this.startTime);
    });
  });

  describe("before the start block", () => {
    before(async () => {
      await Promise.all([
        this.lp.approve(this.farm.address, 1500, { from: alice }),
        this.lp.approve(this.farm.address, 500, { from: bob }),
      ]);

      await Promise.all([
        this.farm.stakeInPool(0, 1500, { from: alice }),
        this.farm.stakeInPool(0, 500, { from: bob }), // bob at deposited [0]
      ]);
    });

    it("allows participants to join", async () => {
      const balanceFarm = await this.lp.balanceOf(this.farm.address);
      assert.equal(2000, balanceFarm);

      const balanceAlice = await this.lp.balanceOf(alice);
      const depositAlice = await this.farm.totalDeposited(0, alice);
      assert.equal(3500, balanceAlice);
      assert.equal(1500, depositAlice);

      const balanceBob = await this.lp.balanceOf(bob);
      const depositBob = await this.farm.totalDeposited(0, bob);
      assert.equal(0, balanceBob);
      assert.equal(500, depositBob);
    });

    it("does not assign any rewards yet", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(0, totalPending);
    });
  });

  describe("after 10 seconds of farming", () => {
    before(async () => {
      await time.increaseTo(this.startTime + 10);
    });

    it("has a total reward of 1000 MOCK pending", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(1000, totalPending);
    });

    it("reserved 750 for alice and 250 for bob", async () => {
      const pendingAlice = await this.farm.pending(0, alice);
      assert.equal(750, pendingAlice);

      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(250, pendingBob);
    });
  });
  
  describe("with a 3th participant after 30 seconds", () => {
    before(async () => {
      await time.increaseTo(this.startTime + 30);

      await this.lp.approve(this.farm.address, 2000, { from: carl });
      await this.farm.stakeInPool(0, 1500, { from: carl });  // deposits[0]
      await this.farm.stakeInPool(0, 500, { from: carl });  // deposits[1] // also claims 42
    });

    it("has a total reward of 2900 MOCK pending", async () => {
      let currentBlock = await web3.eth.getBlockNumber();
      let time = (await web3.eth.getBlock(currentBlock)).timestamp;
      const diff = Number(time) - Number(this.startTime)
      const rewards = diff * 100;
      const totalPending = await this.farm.totalPending();
      assert.equal(rewards, totalPending);
    });

    it("reserved 2250 for alice, 750 for bob, and nothing for carl", async () => {
      const pendingAlice = await this.farm.pending(0, alice);
      assert.equal(2250, pendingAlice);

      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(750, pendingBob);

      const pendingCarl = await this.farm.pending(0, carl);
      assert.equal(0, pendingCarl);
    });
  });

  describe("after 50 seconds of farming", () => {
    before(async () => {
      await time.increaseTo(this.startTime + 50);
    });

    it("has a total reward of 4958 MOCK pending", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(5000, totalPending);
    });

    it("reserved 3000 for alice, 1000 for bob, and 1000 for carl", async () => {
      const pendingAlice = await this.farm.pending(0, alice);
      assert.equal(3000, pendingAlice); // 713 = (100 * 1500/4000)*19 

      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(1000, pendingBob);

      const pendingCarl = await this.farm.pending(0, carl);
      assert.equal(1000, pendingCarl);
    });
  });

  describe("with a participant withdrawing after 70 seconds", () => {
    before(async () => {
      await time.increaseTo(this.startTime + 70);

      await this.farm.withdrawUnlockedDeposit(0, 0, { from: alice }); // unstake 1500
    });

    it("gives alice 3755 MOCK and 1500 LP", async () => {
      const balanceERC20 = await this.erc20.balanceOf(alice);
      assert.equal(3000+750, balanceERC20);

      const balanceLP = await this.lp.balanceOf(alice);
      assert.equal(5000, balanceLP);
    });

    it("has no deposit for alice", async () => {
      const deposited = await this.farm.totalDeposited(0, alice);
      assert.equal(0, deposited);
    });

    it("has a total reward of 3203 MOCK pending", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(3250, totalPending); // (7000  |100(token/second)*70(seconds) = 7000 token|) - (3750 claimed by alice )
    });

    it("reserved nothing for alice, 1250 for bob, and 2000 for carl", async () => {
      const pendingAlice = await this.farm.pending(0, alice);
      assert.equal(0, pendingAlice);

      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(1250, pendingBob);

      const pendingCarl = await this.farm.pending(0, carl);
      assert.equal(2000, pendingCarl);
    });
  });

  describe("with a participant partially withdrawing after 80 blocks", () => {
    before(async () => {
      await time.increaseTo(this.startTime + 80);
      await this.farm.withdrawUnlockedDeposit(0, 0, { from: carl }); // widraw deposit deposit[0] 
    });

    it("gives carl 2800 MOCK and 1500 LP", async () => {
      const balanceERC20 = await this.erc20.balanceOf(carl);
      assert.equal(2800, balanceERC20);

      const balanceLP = await this.lp.balanceOf(carl);
      assert.equal(1500, balanceLP);
    });

    it("has a 500 LP deposit for carl", async () => {
      const deposited = await this.farm.totalDeposited(0, carl);
      assert.equal(500, deposited);
    });

    it("has a total reward of 1450 MOCK pending", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(1450, totalPending);
    });

    it("reserved nothing for alice, 1451 for bob, and nothing for carl", async () => {
      const pendingAlice = await this.farm.pending(0, alice);
      assert.equal(0, pendingAlice);

      const pendingBob = await this.farm.pending(0, bob);
      assert.equal(1450, pendingBob);

      const pendingCarl = await this.farm.pending(0, carl);
      assert.equal(0, pendingCarl);
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
      assert.equal(500, deposited);

      await truffleAssert.reverts(
        this.farm.withdrawUnlockedDeposit(0, 1, { from: carl })
      );
    });
  });

  describe("when it receives more funds (8000 MOCK)", () => {
    before(async () => {
      await this.erc20.approve(this.farm.address, 8000);
      await this.farm.fund(8000);
    });

    it("runs for 180 blocks (80 more)", async () => {
      const endTime = await this.farm.endTime();
      assert.equal(180, endTime - this.startTime);
    });
  });

  describe("with an added lp token (for 25%) after 100 blocks", () => {
    before(async () => {
      await time.increaseTo(this.startTime + 100);

      await this.farm.addPool(this.lp2.address,5,0,0,0);
    });

    it("has a total reward of 3450 MOCK pending", async () => {
      const currentBlock = await web3.eth.getBlockNumber();
      const curr = (await web3.eth.getBlock(currentBlock)).timestamp;
      assert.equal(curr - (await this.farm.startTime()), 100);

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
      await time.increaseTo(this.startTime + 110);

      await this.lp2.approve(this.farm.address, 500, { from: carl });
      await this.farm.stakeInPool(1, 200, { from: carl });  // deposit at pool 1 at index [0]
      await this.farm.stakeInPool(1, 300, { from: carl })  // deposit at pool 1 at index [1] claims 25 at the same time
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
      await time.increaseTo(this.startTime + 120);

      await this.lp2.approve(this.farm.address, 1000, { from: alice });
      await this.farm.stakeInPool(1, 1000, { from: alice });
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
      await time.increaseTo(this.startTime + 140);

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
      await time.increaseTo(this.startTime + 150);

      const pendingCarl = await this.farm.pending(1, carl);
      assert.equal(500, pendingCarl);
      balanceBefore = await  await this.erc20.balanceOf(carl);
      await this.farm.withdrawUnlockedDeposit(1, 0, { from: carl }); // should be 200 + rewards 
    });

    it("gives carl 500 MOCK and 200 LP", async () => {
      const balanceERC20 = await this.erc20.balanceOf(carl);
      assert.equal(500,balanceERC20-balanceBefore);

      const balanceLP = await this.lp2.balanceOf(carl);
      assert.equal(500, balanceLP);
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
      await time.increaseTo(this.startTime + 160);
    });

    it('Fails to emergency withdraw when not paused', async () => {
        await truffleAssert.reverts(
          this.farm.emergencyWithdraw(1, { from: carl }),
          "Pausable: not paused"
        );
    });
    let balanceERC20Before;

    it('It does not fail to emergency withdraw when paused', async() => {
      balanceERC20Before = await this.erc20.balanceOf(carl);
      await this.farm.pause();

      await this.farm.emergencyWithdraw(1, { from: carl });
      await this.farm.unPause();
    });

    it("gives carl 500 LP", async () => {
      const balanceLP = await this.lp2.balanceOf(carl);
      assert.equal(800, balanceLP);
    });

    it("gives carl no MOCK", async () => {
      const balanceERC20 = await this.erc20.balanceOf(carl);
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
      await time.increaseTo(this.startTime + 180);
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
      await time.increaseTo(this.startTime + 200);
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
      const balanceERC20 = await this.erc20.balanceOf(alice);
      assert.equal(5000, balanceERC20);

      const balanceLP = await this.lp.balanceOf(alice);
      assert.equal(5000, balanceLP);

      const balanceLP2 = await this.lp2.balanceOf(alice);
      assert.equal(1000, balanceLP2);
    });

    it("gives carl 5450 MOCK and 500 LP", async () => {
      const balanceERC20 = await this.erc20.balanceOf(bob);
      assert.equal(5450, balanceERC20);

      const balanceLP = await this.lp.balanceOf(bob);
      assert.equal(500, balanceLP);
    });

    it("gives carl 4000 MOCK and 500 LP", async () => {
      const balanceERC20 = await this.erc20.balanceOf(carl);
      assert.equal(7300, balanceERC20);

      const balanceLP = await this.lp.balanceOf(carl);
      assert.equal(2000, balanceLP);

      const balanceLP2 = await this.lp2.balanceOf(carl);
      assert.equal(800, balanceLP2);
    });

    it("has an end balance of 250 MOCK, which is lost forever", async () => {
      const totalPending = await this.farm.totalPending();
      assert.equal(250, totalPending);

      const balanceFarm = await this.erc20.balanceOf(this.farm.address);
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
  
});
*/