import { ethers } from "hardhat";
const hre = require("hardhat");

async function main() {
  console.log("Deploying process started ... Please wait till all contract will be deployed.")

  const MyERC20 = await hre.ethers.getContractFactory("MyERC20");
  const myErc20 = await MyERC20.deploy();
  await myErc20.deployed();
  console.log("MyERC20 deployed on address: ", myErc20.address);

  const Vesting = await hre.ethers.getContractFactory("Vesting");
  const vesting = await Vesting.deploy();
  await vesting.deployed();
  console.log("Vesting deployed on address: ", vesting.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
