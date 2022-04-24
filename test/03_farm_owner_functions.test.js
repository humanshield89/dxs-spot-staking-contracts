const Farm = artifacts.require('./LockedStakingFarm.sol');
const BEP20 = artifacts.require('./test/ERC20Mock.sol');
const LP = artifacts.require('./test/LPMock.sol');
const {waitUntilBlock} = require('./helpers/tempo')(web3);
const truffleAssert = require('truffle-assertions');
const {toWei} = web3.utils;
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

contract('Farm Special Functions', ([owner, alice, bob, carl, adminWallet, adminWallet2]) => {
    before(async () => {
        this.bep20 = await BEP20.new("Mock token", "MOCK", toWei('1000000000'));
        let balance = await this.bep20.balanceOf(owner);
        assert.equal(balance.valueOf(), toWei('1000000000'));

        this.lp = await LP.new("LP Token", "LP");
        this.lp2 = await LP.new("LP Token 2", "LP2");

        const currentBlock = await getCurrentTime();
        this.startTime = currentBlock + 100;

        this.farm = await Farm.new(this.bep20.address, owner, adminWallet);
        // withdrawal fee of 5% (argument/1000)
        await this.farm.addPool(this.lp.address,15,0,0,0);
        await this.farm.setStartTime(this.startTime);

        await this.bep20.approve(this.farm.address, toWei('5000000'));
        await this.farm.changeRewardPerSecond(toWei('100'));
        await this.farm.fund(toWei('5000000'));//50000
    });

    before(async () => {
        await Promise.all([
            this.lp.mint(alice, toWei('5000')),
            this.lp.mint(bob, toWei('500')),
            this.lp.mint(carl, toWei('2000')),
        ]);

        const [balanceAlice, balanceBob, balanceCarl] = await Promise.all([
            this.lp.balanceOf(alice),
            this.lp.balanceOf(bob),
            this.lp.balanceOf(carl),
        ]);

        assert.equal(toWei('5000'), balanceAlice);
        assert.equal(toWei('500'), balanceBob);
        assert.equal(toWei('2000'), balanceCarl);
    });

    before(async () => {
        await Promise.all([
            this.lp2.mint(alice, toWei('1000')),
            this.lp2.mint(carl, toWei('800')),
        ]);

        const [balanceAlice, balanceBob, balanceCarl] = await Promise.all([
            this.lp2.balanceOf(alice),
            this.lp2.balanceOf(bob),
            this.lp2.balanceOf(carl),
        ]);

        assert.equal(toWei('1000'), balanceAlice);
        assert.equal(toWei('0'), balanceBob);
        assert.equal(toWei('800'), balanceCarl);
    });

    describe('when created', () => {

        it('is initialized for the LP token', async () => {
            const poolLength = await this.farm.poolLength();
            assert.equal(1, poolLength);

            const poolInfo = await this.farm.poolInfo(0);
            assert.equal(poolInfo[0], this.lp.address);
            assert.equal(poolInfo[1].words[0], 15);
            assert.equal(poolInfo[4].words[0], 0);
            assert.equal(poolInfo[5].words[0], 0);


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


        it('Reducing rewards per block push the end block to the future and avoids division precision loss', async () => {
            await this.farm.changeRewardPerSecond(toWei('60'));

            const adminBalance = await this.bep20.balanceOf(adminWallet);
            assert.equal(adminBalance, toWei('20'));

            const endTime = await this.farm.endTime();
            assert.equal(83333, endTime - this.startTime);

            const balance = await this.bep20.balanceOf(this.farm.address);
            assert.equal(balance, toWei('4999980'));
        });

        it('Increasing rewards per block pushes the endblock closer and avoids division precision loss', async () => {
            await this.farm.changeRewardPerSecond(toWei('100'));

            const adminBalance = await this.bep20.balanceOf(adminWallet);
            assert.equal(adminBalance, toWei('100')); // 20 from last call and 80 for the current call 

            const endTime = await this.farm.endTime();
            assert.equal(50000 - 1, endTime - this.startTime);

            let balance = await this.bep20.balanceOf(this.farm.address);
            assert.equal(balance, toWei('4999900'));

            await this.bep20.approve(this.farm.address, toWei('100'));
            await this.farm.fund(toWei('100'));

            balance = await this.bep20.balanceOf(this.farm.address);
            assert.equal(balance, toWei('5000000'));
        })

        it('can Pause only by owner', async () => {
            await truffleAssert.reverts(
                this.farm.pause({from: alice}),
                "Ownable: caller is not the owner"
            );

            await this.farm.pause();
            assert.equal(true, await this.farm.paused());
        });

        it('Does not allow deposits when paused', async() => {
            await this.lp.approve(this.farm.address, toWei('1500'), {from: alice});

            await truffleAssert.reverts(
                this.farm.stakeInPool(0, toWei('1500'), {from: alice}),
                "Pausable: paused"
            );
        });
        
        it('can only unpause only by owner', async() => {
            await truffleAssert.reverts(
                this.farm.unPause({from: alice}),
                "Ownable: caller is not the owner"
            );

            await this.farm.unPause();
            assert.equal(false, await this.farm.paused());
        });

        it('Allows participants to join', async () => {
            await Promise.all([
                this.lp.approve(this.farm.address, toWei('1500'), {from: alice}),
                this.lp.approve(this.farm.address, toWei('500'), {from: bob})
            ]);

            await Promise.all([
                this.farm.stakeInPool(0, toWei('1500'), {from: alice}),
                this.farm.stakeInPool(0, toWei('500'), {from: bob})
            ]);

            const balanceFarm = await this.lp.balanceOf(this.farm.address);
            assert.equal(toWei('2000'), balanceFarm);

            const balanceAlice = await this.lp.balanceOf(alice);
            const depositAlice = await this.farm.totalDeposited(0, alice);
            assert.equal(toWei('3500'), balanceAlice);
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
    })

    describe('after 10 blocks of farming', () => {
        before(async () => {
            await time.increaseTo(this.startTime + 10);
        });

        it('reserved 750 for alice and 250 for bob', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(toWei('750'), pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(toWei('250'), pendingBob);
        });
    });

    describe('with a 3th participant after 30 blocks', () => {
        before(async () => {
            await time.increaseTo(this.startTime + 30);

            await this.lp.approve(this.farm.address, toWei('2000'), {from: carl});
            await this.farm.stakeInPool(0, toWei('2000'), {from: carl});
        });

        it('reserved 2250 for alice, 750 for bob, and nothing for carl', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(toWei('2250'), pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(toWei('750'), pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(toWei('0'), pendingCarl);
        });
    });

    describe('Farming after 50 blocks', () => {
        before(async () => {
            await time.increaseTo(this.startTime + 50);
        });

        it('reserved 3000 for alice, 1000 for bob, and 1000 for carl', async () => {
            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(toWei('3000'), pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(toWei('1000'), pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(toWei('1000'), pendingCarl);
        });

        it('Increasing rewards per block pushes the endblock closer', async () => {
            await this.farm.changeRewardPerSecond(toWei('200'));

            const endTime = await this.farm.endTime();
            assert.equal(25025, endTime - this.startTime);

            const balance = await this.bep20.balanceOf(this.farm.address);
            assert.equal(balance, toWei('5000000'));

            const lastAmount = await this.farm.rewardsAmountBeforeLastChange();
            assert.equal(lastAmount, toWei('5000')); // 50 seconds

            const lastChnage = await this.farm.lastEmissionChange();
            assert.equal(lastChnage - await this.farm.startTime(), 50);

            const adminBalance = await this.bep20.balanceOf(adminWallet);
            assert.equal(adminBalance, toWei('100')); // 100 from the two first tests and 100 from the current one
        });

        it('Did not messup the rewards after rewards changing', async () => {
            await time.increaseTo(this.startTime + 60);

            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(toWei('3750'), pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(toWei('1250'), pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(toWei('2000'), pendingCarl);
        });

        it('Decreasing rewards per block pushes the endblock further to the future', async () => {
            await this.farm.changeRewardPerSecond(toWei('100'));

            const endTime = await this.farm.endTime();
            assert.equal(49990, endTime - this.startTime);

            const balance = await this.bep20.balanceOf(this.farm.address);
            assert.equal(balance, toWei('5000000'));

            const lastAmount = await this.farm.rewardsAmountBeforeLastChange();
            assert.equal(lastAmount, toWei('7000')); // 51 blocks at 100 per block + 10 blocks at 200 per block

            const lastChnage = await this.farm.lastEmissionChange();
            assert.equal(lastChnage - await this.farm.startTime(), 60);

            const adminBalance = await this.bep20.balanceOf(adminWallet);
            assert.equal(adminBalance, toWei('100')); // 100 from the two first tests and 100 from the current one
        });

        it('Did not messup the rewards after rewards changing', async () => {
            await await time.increaseTo(this.startTime + 70);

            const pendingAlice = await this.farm.pending(0, alice);
            assert.equal(toWei('4125'), pendingAlice);

            const pendingBob = await this.farm.pending(0, bob);
            assert.equal(toWei('1375'), pendingBob);

            const pendingCarl = await this.farm.pending(0, carl);
            assert.equal(toWei('2500'), pendingCarl);

            const lastChnage = await this.farm.lastEmissionChange();
            assert.equal(lastChnage - await this.farm.startTime(), 60);

        });

        it('Has the right amount of pending', async () => {
            // 7100 + 100 *9 = 8000?
            const totalPending = await this.farm.totalPending();
            assert.equal(toWei("8000"), totalPending);
        });

    });

    describe('Widrawal after 70 blocks', async () => {
        before(async () => {
            await this.farm.withdrawUnlockedDeposit(0, 0, {from: alice});
        });

        it('should claim 4125 Rewards for Alice', async () => {
            const aliceBalance = await this.bep20.balanceOf(alice);
            assert.equal(toWei("4125"), aliceBalance);
        });
    });

    describe('Change widrawal address', async () => {//adminWallet2
        before(async () => {
            await this.farm.changefeeCollector(adminWallet2, {from: owner});
        });

        it('Should change widthrawal wallet ', async () => {
            const feeWallet = await this.farm.feeCollector();
            assert.equal(adminWallet2, feeWallet);
        });
    });
});
