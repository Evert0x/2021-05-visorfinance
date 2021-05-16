import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai, { expect } from "chai";
import { constants, Wallet } from "ethers";
import { formatEther, parseUnits, randomBytes } from "ethers/lib/utils";
import { deployContract, signPermission, signPermitEIP2612 } from "./utils";

const DAY = 60 * 60 * 24;

chai.use(solidity);

describe.only("Token contract", function () {
  before(async function () {
    [this.owner, this.alice, this.bob, this.carol] = await ethers.getSigners();

    // Deploy tokens for staking and rewards
    const StakingToken = await ethers.getContractFactory("StakingToken");
    const RewardToken = await ethers.getContractFactory("RewardToken");

    this.stakingToken = await StakingToken.deploy(this.owner.address);
    this.rewardToken = await RewardToken.deploy(this.owner.address);

    // Deploy VisorFactory & Visor template
    const VisorFactory = await ethers.getContractFactory("VisorFactory");
    const Visor = await ethers.getContractFactory("Visor");

    const visorTemplate = await Visor.deploy();
    const visorFactory = await VisorFactory.deploy();

    await visorTemplate.initializeLock();

    const name = ethers.utils.formatBytes32String("VISOR-1.0.0");
    await visorFactory.addTemplate(name, visorTemplate.address);

    // Deploy user's Visor
    this.visor = await ethers.getContractAt(
      "Visor",
      await visorFactory.callStatic["create()"]()
    );
    await visorFactory["create()"]();

    this.amount = 1000;
    this.signerWallet = Wallet.fromMnemonic(process.env.DEV_MNEMONIC || "");
  });
  it("Approval to alice", async function () {
    await this.visor.approveTransferERC20(
      this.stakingToken.address,
      this.alice.address,
      this.amount
    );
  });
  it("Lock alice", async function () {
    let permission = await signPermission(
      "Lock",
      this.visor,
      this.signerWallet,
      this.alice.address,
      this.stakingToken.address,
      this.amount,
      0
    );

    expect(await this.visor.getBalanceLocked(this.stakingToken.address)).to.eq(
      0
    );
    await this.stakingToken.transfer(this.visor.address, this.amount);
    await this.visor
      .connect(this.alice)
      .lock(this.stakingToken.address, this.amount, permission);

    expect(await this.visor.getBalanceLocked(this.stakingToken.address)).to.eq(
      this.amount
    );
  });
  it("Move alice", async function () {
    await expect(
      this.visor
        .connect(this.alice)
        .delegatedTransferERC20(
          this.stakingToken.address,
          this.alice.address,
          this.amount
        )
    ).to.be.revertedWith("UniversalVault: insufficient balance");
  });
  it("Lock bob", async function () {
    let permission = await signPermission(
      "Lock",
      this.visor,
      this.signerWallet,
      this.bob.address,
      this.stakingToken.address,
      this.amount,
      1
    );

    expect(await this.visor.getBalanceLocked(this.stakingToken.address)).to.eq(
      this.amount
    );
    await this.stakingToken.transfer(this.visor.address, this.amount);
    await this.visor
      .connect(this.bob)
      .lock(this.stakingToken.address, this.amount, permission);

    expect(await this.visor.getBalanceLocked(this.stakingToken.address)).to.eq(
      this.amount
    );
  });
  it("Move alice again", async function () {
    expect(await this.stakingToken.balanceOf(this.alice.address)).to.eq(0);
    await this.visor
      .connect(this.alice)
      .delegatedTransferERC20(
        this.stakingToken.address,
        this.alice.address,
        this.amount
      );
    expect(await this.stakingToken.balanceOf(this.alice.address)).to.eq(
      this.amount
    );
  });
});
