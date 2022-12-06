// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

contract Vesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct VestingSchedule {
        uint64 start;
        uint64 end;
        uint64 lastWithdrawnOn;
        uint256 totalVestedAmount; /// total amount
        uint256 permittedAmountForInitClaim;
        uint256 withdrawn;
    }
    
    uint64 constant PERCENTAGE_BP = 1e4; /// 10_000

    mapping(address => mapping(address => VestingSchedule))
        private vestingSchedules;

    /**
     * @notice Creates a new vesting schedule for a beneficiary.
     */
    function createVestingSchedule(
        address beneficiary,
        uint64 start,
        uint64 end,
        address currency,
        uint256 totalVestedAmount,
        uint256 instantRewardPercentageBp
    ) public payable onlyOwner {
        require(
            vestingSchedules[beneficiary][currency].totalVestedAmount == 0,
            "Existing schedule"
        );
        require(beneficiary != address(0), "Zero address");
        require(start < end, "Should be greater than start time");
        require(end > block.timestamp, "Should be greater then current time");
        require(totalVestedAmount > 0, "Amount must be > 0");
        require(instantRewardPercentageBp > 0, "Percentage must be > 0");
        require(
            instantRewardPercentageBp < PERCENTAGE_BP,
            "Should be less then 100%"
        );

        uint256 permittedAmountForInitClaim = (totalVestedAmount *
            instantRewardPercentageBp) / PERCENTAGE_BP;

        vestingSchedules[beneficiary][currency] = VestingSchedule(
            start,
            end,            
            0, /// initial withdraw  timestamp
            totalVestedAmount,
            permittedAmountForInitClaim, /// permitted amount to immediately withdraw
            0 /// initial  withdrawn amount
        );

        if (currency == address(0)) {
            require(msg.value == totalVestedAmount, "Should be equal amount");
        } else {
            require(msg.value == 0, "Transaction should be only in ERC20");
            IERC20(currency).safeTransferFrom(
                msg.sender,
                address(this),
                totalVestedAmount
            );
        }
    }

    ///@dev return total vesting amount without permitted amount
    function calcCurrentClaimAmount(
        address beneficiary,
        address currency
    ) public view returns (uint256 amountOnCurrentTime) {
        if (block.timestamp >= vestingSchedules[beneficiary][currency].end) {
            return
                vestingSchedules[beneficiary][currency].totalVestedAmount -
                vestingSchedules[beneficiary][currency]
                    .permittedAmountForInitClaim;
        } else {
            /// compute total duration period
            uint256 totalDurationPeriod = vestingSchedules[beneficiary][
                currency
            ].end - vestingSchedules[beneficiary][currency].start;

            uint256 amountPerSecond = vestingSchedules[beneficiary][currency]
                .totalVestedAmount / totalDurationPeriod;

            amountOnCurrentTime =
                amountPerSecond *
                (block.timestamp -
                    vestingSchedules[beneficiary][currency].start);

            return amountOnCurrentTime;
        }
    }

    function withdrawVestingAmountByBeneficiary(
        address currency
    ) public payable nonReentrant {
        VestingSchedule storage schedule = vestingSchedules[msg.sender][
            currency
        ];

        require(schedule.totalVestedAmount != 0, "No schedule for sender");
        require(
            schedule.totalVestedAmount != schedule.withdrawn,
            "Balance fully withdrawn"
        );

        uint256 amountOnClaimTime = calcCurrentClaimAmount(
            msg.sender,
            currency
        );

        uint256 currentAmountToWithdraw = amountOnClaimTime +
            schedule.permittedAmountForInitClaim -
            schedule.withdrawn;
        require(
            schedule.totalVestedAmount >=
                currentAmountToWithdraw + schedule.withdrawn,
            "Under total vesting amount"
        );

        schedule.withdrawn += currentAmountToWithdraw;
        schedule.lastWithdrawnOn = uint64(block.timestamp);

        if (currency == address(0)) {
            (bool os, ) = msg.sender.call{value: currentAmountToWithdraw}("");
            require(os);
        } else {
            IERC20(currency).safeTransfer(msg.sender, currentAmountToWithdraw);
        }
    }

    function getCurrentClaimAmount(
        address beneficiary,
        address currency
    ) public view returns (uint256 _amount) {
        return
            calcCurrentClaimAmount(beneficiary, currency) +
            vestingSchedules[beneficiary][currency]
                .permittedAmountForInitClaim -
            vestingSchedules[msg.sender][currency].withdrawn;
    }

    function getBlockedClaimAmount(
        address beneficiary,
        address currency
    ) public view returns (uint256 _amount) {
        uint256 currentClaimAmount = calcCurrentClaimAmount(
            beneficiary,
            currency
        ) +
            vestingSchedules[beneficiary][currency]
                .permittedAmountForInitClaim -
            vestingSchedules[msg.sender][currency].withdrawn;

        return
            vestingSchedules[beneficiary][currency].totalVestedAmount -
            currentClaimAmount;
    }

    ///@dev check for valid schedule
    function getSchedules(
        address beneficiary,
        address currency
    ) public view returns (VestingSchedule memory) {
        return vestingSchedules[beneficiary][currency];
    }

    ///@dev check for permitted amount 
    function getPermittedAmountForInitClaim(
        address beneficiary,
        address currency
    ) public view returns (uint256 permittedAmount) {
        return
            vestingSchedules[beneficiary][currency].permittedAmountForInitClaim;
    }
}
