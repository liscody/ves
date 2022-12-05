import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { network, ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
const { BigNumber } = ethers;
const { constants } = require("@nomicfoundation/hardhat-toolbox");

describe("Vesting", function () {
  let Vesting = null;
  let vesting: any = null;
  let MyERC20 = null;
  let myErc20: any = null;
  let SecondERC20 = null;
  let secondErc20: any = null;
  let NewMyERC20 = null;
  let newMyERC20: any = null;

  let myErc20Address: any;
  let secondErc20Address: any;
  let vestingAddress: any;

  let owner: SignerWithAddress;
  let beneficiary: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let eve: SignerWithAddress;

  let instantRewardPercentageBp = 1000; // 10%
  const oneDay = 86400;
  let totalVestedAmount = ethers.utils.parseEther("50"); // 50000000000000000000 === 50 ETH

  const zeroAddress = ethers.constants.AddressZero;

  let withdrawn;
  let lastWithdrawnOn;

  beforeEach(async function () {  
    [owner, beneficiary, alice, bob, eve] = await ethers.getSigners();

    const start = await time.latest(); //.toNumber();
    const end = (await time.latest()) + oneDay * 365; //.toNumber();
    // console.log(now, "NOW!!!")
    const beneficiaryAddress = beneficiary.address;
    MyERC20 = await ethers.getContractFactory("MyERC20");
    myErc20 = await MyERC20.deploy();
    await myErc20.deployed();
    myErc20Address = myErc20.address;

    SecondERC20 = await ethers.getContractFactory("MyERC20");
    secondErc20 = await SecondERC20.deploy();
    await secondErc20.deployed();
    secondErc20Address = secondErc20.address;

    Vesting = await ethers.getContractFactory("Vesting");
    vesting = await Vesting.deploy();
    await vesting.deployed();

    vestingAddress = vesting.address;

    await myErc20.approve(vestingAddress, totalVestedAmount);
    await secondErc20.approve(vestingAddress, totalVestedAmount);

    await vesting.createVestingSchedule(
      beneficiaryAddress,
      start,
      end,
      myErc20Address,
      totalVestedAmount,
      instantRewardPercentageBp
    );

    await vesting.createVestingSchedule(
      beneficiaryAddress,
      start,
      end,
      zeroAddress,
      totalVestedAmount,
      instantRewardPercentageBp,
      {
        value: totalVestedAmount,
      }
    );
  });

  describe("Function withdrawVestingAmountByBeneficiary", function () {
    it("Should revert 'No schedule for sender'", async () => {
      expect(
        vesting.withdrawVestingAmountByBeneficiary(secondErc20Address)
      ).to.be.revertedWith("No schedule for sender");
    });

    it("Should revert 'Balance fully withdrawn'", async () => {
      let further = (await time.latest()) + oneDay * 365 + oneDay;
      await time.increaseTo(further);
      await vesting
        .connect(beneficiary)
        .withdrawVestingAmountByBeneficiary(myErc20Address);

      expect(
        vesting
          .connect(beneficiary)
          .withdrawVestingAmountByBeneficiary(myErc20Address)
      ).to.be.revertedWith("Balance fully withdrawn");
    });

    it("Check amount On Claim Time request", async () => {
      let further = (await time.latest()) + oneDay * 365 + oneDay;
      await time.increaseTo(further);

      let amountOnClaimTime = await vesting.calcCurrentClaimAmount(
        beneficiary.address,
        myErc20Address
      );

      let rewardPercentage = totalVestedAmount.mul(1000).div(10000);

      expect(amountOnClaimTime.add(rewardPercentage)).to.be.equal(
        totalVestedAmount
      );
    });

    it("Should revert 'Under total vesting amount'", async () => {
      await vesting.getSchedules(beneficiary.address, myErc20Address);

      let further = (await time.latest()) + oneDay * 365 + oneDay;
      await time.increaseTo(further);

      await vesting
        .connect(beneficiary)
        .withdrawVestingAmountByBeneficiary(myErc20Address);

      expect(
        vesting
          .connect(beneficiary)
          .withdrawVestingAmountByBeneficiary(myErc20Address)
      ).to.be.revertedWith("Under total vesting amount");
    });

    it("Should change balance in ERC20", async () => {
      const beneficiaryBalanceBefore = await myErc20.balanceOf(
        beneficiary.address
      );

      await vesting
        .connect(beneficiary)
        .withdrawVestingAmountByBeneficiary(myErc20Address);

      const beneficiaryBalanceAfter = await myErc20.balanceOf(
        beneficiary.address
      );

      const permittedAmount = await vesting.getPermittedAmountForInitClaim(
        beneficiary.address,
        myErc20Address
      );

      const currentClaimAmount = await vesting.calcCurrentClaimAmount(
        beneficiary.address,
        myErc20Address
      );

      expect(permittedAmount.add(currentClaimAmount)).to.be.equal(
        beneficiaryBalanceAfter
      );
    });
  });

  describe("Withdraw. Change balance in native currency", function () {
    it("Should change balance in native currency", async () => {
      const beneficiaryBalanceBefore = await vesting.provider.getBalance(
        beneficiary.address
      );

      await vesting
        .connect(beneficiary)
        .withdrawVestingAmountByBeneficiary(zeroAddress);

      const beneficiaryBalanceAfter = await vesting.provider.getBalance(
        beneficiary.address
      );

      const gasFee = beneficiaryBalanceBefore.sub(beneficiaryBalanceAfter);

      const permittedAmount = await vesting.getPermittedAmountForInitClaim(
        beneficiary.address,
        zeroAddress
      );

      const currentClaimAmount = await vesting.calcCurrentClaimAmount(
        beneficiary.address,
        zeroAddress
      );
      expect(
        beneficiaryBalanceBefore
          .add(permittedAmount)
          .add(currentClaimAmount)
          .sub(gasFee)
      ).to.be.equal(
        beneficiaryBalanceAfter.add(permittedAmount).add(currentClaimAmount)
      );
    });
  });

  describe("Withdraw after one year or longer", function () {
    it("Should change balance in native currency after 100 days & after year", async () => {
      const beneficiaryBalanceBefore = await vesting.provider.getBalance(
        beneficiary.address
      );

      let further = (await time.latest()) + oneDay * 100;
      await time.increaseTo(further);

      await vesting
        .connect(beneficiary)
        .withdrawVestingAmountByBeneficiary(zeroAddress);

      const beneficiaryBalanceAfter = await vesting.provider.getBalance(
        beneficiary.address
      );

      const gasFee = beneficiaryBalanceBefore.sub(beneficiaryBalanceAfter);

      const permittedAmount = await vesting.getPermittedAmountForInitClaim(
        beneficiary.address,
        zeroAddress
      );

      const currentClaimAmount = await vesting.calcCurrentClaimAmount(
        beneficiary.address,
        zeroAddress
      );

      expect(
        beneficiaryBalanceBefore
          .add(permittedAmount)
          .add(currentClaimAmount)
          .sub(gasFee)
      ).to.be.equal(
        beneficiaryBalanceAfter.add(permittedAmount).add(currentClaimAmount)
      );

      further = (await time.latest()) + oneDay * 100;
      await time.increaseTo(further);

      await vesting
        .connect(beneficiary)
        .withdrawVestingAmountByBeneficiary(zeroAddress);

      const newBeneficiaryBalanceAfter = await vesting.provider.getBalance(
        beneficiary.address
      );

      const newGasFee = beneficiaryBalanceBefore.sub(
        newBeneficiaryBalanceAfter
      );

      const newPermittedAmount = await vesting.getPermittedAmountForInitClaim(
        beneficiary.address,
        zeroAddress
      );

      const newCurrentClaimAmount = await vesting.calcCurrentClaimAmount(
        beneficiary.address,
        zeroAddress
      );

      expect(
        beneficiaryBalanceBefore
          .add(newPermittedAmount)
          .add(newCurrentClaimAmount)
          .sub(newGasFee)
      ).to.be.equal(
        newBeneficiaryBalanceAfter
          .add(newPermittedAmount)
          .add(newCurrentClaimAmount)
      );
    });
  });

  describe("Withdraw ERC20 after one year or longer", function () {
    it("Should change balance in ERC20", async () => {
      const beneficiaryBalanceBefore = await myErc20.balanceOf(
        beneficiary.address
      );

      let further = (await time.latest()) + oneDay * 100;
      await time.increaseTo(further);

      await vesting
        .connect(beneficiary)
        .withdrawVestingAmountByBeneficiary(myErc20Address);

      const beneficiaryBalanceAfter100 = await myErc20.balanceOf(
        beneficiary.address
      );

      further = (await time.latest()) + oneDay * 200;
      await time.increaseTo(further);

      await vesting
        .connect(beneficiary)
        .withdrawVestingAmountByBeneficiary(myErc20Address);

      const beneficiaryBalanceAfter200 = await myErc20.balanceOf(
        beneficiary.address
      );

      further = (await time.latest()) + oneDay * 365 + oneDay;
      await time.increaseTo(further);

      await vesting
        .connect(beneficiary)
        .withdrawVestingAmountByBeneficiary(myErc20Address);

      const beneficiaryBalanceAfter365 = await myErc20.balanceOf(
        beneficiary.address
      );

      const permittedAmount = await vesting.getPermittedAmountForInitClaim(
        beneficiary.address,
        myErc20Address
      );

      const currentClaimAmount = await vesting.calcCurrentClaimAmount(
        beneficiary.address,
        myErc20Address
      );

      expect(totalVestedAmount).to.be.equal(beneficiaryBalanceAfter365);
    });

    it("Should revert 'Balance fully withdrawn'", async () => {
      const beneficiaryBalanceBefore = await myErc20.balanceOf(
        beneficiary.address
      );

      let further = (await time.latest()) + oneDay * 100;
      await time.increaseTo(further);

      await vesting
        .connect(beneficiary)
        .withdrawVestingAmountByBeneficiary(myErc20Address);

      further = (await time.latest()) + oneDay * 365 + oneDay;
      await time.increaseTo(further);

      await vesting
        .connect(beneficiary)
        .withdrawVestingAmountByBeneficiary(myErc20Address);

      const beneficiaryBalanceAfter365 = await myErc20.balanceOf(
        beneficiary.address
      );

      further = (await time.latest()) + oneDay * 400;
      await time.increaseTo(further);

      expect(
        vesting
          .connect(beneficiary)
          .withdrawVestingAmountByBeneficiary(myErc20Address)
      ).to.be.revertedWith("Balance fully withdrawn");
    });
  });

  describe("Test createVestingSchedule function", function () {
    it("Should revert 'Existing schedule'", async () => {
      const newStart = await time.latest();
      const newEnd = (await time.latest()) + oneDay * 365;

      await expect(
        vesting
          .connect(owner)
          .createVestingSchedule(
            beneficiary.address,
            newStart,
            newEnd,
            myErc20Address,
            totalVestedAmount,
            instantRewardPercentageBp
          )
      ).to.be.revertedWith("Existing schedule");
    });

    it("Should revert 'Zero address'", async () => {
      const newStart = await time.latest();
      const newEnd = (await time.latest()) + oneDay * 365;

      // console.log(zeroAddress);
      // console.log(secondErc20);

      await expect(
        vesting
          .connect(owner)
          .createVestingSchedule(
            zeroAddress,
            newStart,
            newEnd,
            secondErc20.address,
            totalVestedAmount,
            instantRewardPercentageBp
          )
      ).to.be.revertedWith("Zero address");
    });

    it("Should revert 'Should be greater than start time'", async () => {
      const newStart = await time.latest();
      const newEnd = (await time.latest()) + oneDay * 365;

      await expect(
        vesting
          .connect(owner)
          .createVestingSchedule(
            bob.address,
            newStart,
            newStart,
            secondErc20.address,
            totalVestedAmount,
            instantRewardPercentageBp
          )
      ).to.be.revertedWith("Should be greater than start time");
    });

    it("Should revert 'Should be greater then current time'", async () => {
      const newStart = (await time.latest()) - oneDay;
      const newEnd = (await time.latest()) + 1;

      await expect(
        vesting
          .connect(owner)
          .createVestingSchedule(
            bob.address,
            newStart,
            newEnd,
            secondErc20.address,
            totalVestedAmount,
            instantRewardPercentageBp
          )
      ).to.be.revertedWith("Should be greater then current time");
    });

    it("Should revert 'Amount must be > 0'", async () => {
      const newStart = await time.latest();
      const newEnd = (await time.latest()) + oneDay * 365;

      await expect(
        vesting
          .connect(owner)
          .createVestingSchedule(
            bob.address,
            newStart,
            newEnd,
            secondErc20.address,
            0,
            instantRewardPercentageBp
          )
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("Should revert 'Percentage must be > 0'", async () => {
      const newStart = await time.latest();
      const newEnd = (await time.latest()) + oneDay * 365;

      await expect(
        vesting
          .connect(owner)
          .createVestingSchedule(
            bob.address,
            newStart,
            newEnd,
            secondErc20.address,
            5000000,
            0
          )
      ).to.be.revertedWith("Percentage must be > 0");
    });

    it("Should revert 'Should be less then 100%'", async () => {
      const newStart = await time.latest();
      const newEnd = (await time.latest()) + oneDay * 365;

      await expect(
        vesting.connect(owner).createVestingSchedule(
          bob.address,
          newStart,
          newEnd,
          secondErc20.address,
          5000000,
          10000 + 1 // 100% +1%
        )
      ).to.be.revertedWith("Should be less then 100%");
    });

    it("Should revert 'Should be equal amount'", async () => {
      const newStart = await time.latest();
      const newEnd = (await time.latest()) + oneDay * 365;

      await expect(
        vesting.connect(owner).createVestingSchedule(
          bob.address,
          newStart,
          newEnd,
          zeroAddress,
          5000000,
          1000, // 100% +1%
          {
            value: totalVestedAmount,
          }
        )
      ).to.be.revertedWith("Should be equal amount");
    });

    it("Should revert 'Transaction should be only in ERC20'", async () => {
      const newStart = await time.latest();
      const newEnd = (await time.latest()) + oneDay * 365;

      await expect(
        vesting.connect(owner).createVestingSchedule(
          bob.address,
          newStart,
          newEnd,
          secondErc20.address,
          5000000,
          1000, // 100% +1%
          {
            value: totalVestedAmount,
          }
        )
      ).to.be.revertedWith("Transaction should be only in ERC20");
    });
  });

  describe("Test function getCurrentClaimAmount", function () {
    it("Should return amount", async () => {
      let amount = await vesting.getCurrentClaimAmount(
        beneficiary.address,
        myErc20Address
      );
      expect(amount).not.lessThan(0);
    });
  });

  describe("Test function getBlockedClaimAmount", function () {
    it("Should return amount", async () => {
      let amount = await vesting.getBlockedClaimAmount(
        beneficiary.address,
        myErc20Address
      );
      expect(amount).not.lessThan(0);
    });
  });
});
