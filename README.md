# LockedStaking Farm Contracts

## Features: 
1. Adjustable lock er pool.
2. Infinite pools.
3. Single reward token.
4. Deposit Fee.
5. Early Unlock Fee.

This repository contains LockedStaking Farm contract.

## Local dev setup and testing
1. clone repo
2. install packages 
```shell script
npm install
# or if you prefer
yarn install
```
3. create file `secrets.json` following the same structure as `secrets.exemple.json` put your secret seed and explorer api keys there
4. you can run local tests against ganach or other local deployment by runnung (You have to have ganeche-cli running)
```shell script
truffle test
```
5. you can run migrations 
```
truffle migrate --network [network_name_here]
```
6. you can verify the contracts deployed on the explorer by running 
```
truffle run verify [contract1] [contract2] [contractn] --network [network_name_here]
```

Created by Rachid Boudjelida rachidboudjelida@gmail.com
