const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BookRental", function () {
  let bookRental;
  let owner;
  let arbitrator;
  let renter;
  let otherUser;

  const PRICE_PER_DAY = ethers.utils.parseEther("0.01");
  const DEPOSIT = ethers.utils.parseEther("0.05");

  beforeEach(async function () {
    [owner, arbitrator, renter, otherUser] = await ethers.getSigners();
    const BookRental = await ethers.getContractFactory("BookRental");
    // Owner is deployer
    bookRental = await BookRental.deploy(arbitrator.address);
    await bookRental.deployed();
  });

  describe("listItem", function () {
    it("Should successfully list an item", async function () {
      const tx = await bookRental.connect(owner).listItem("ipfs://cid", PRICE_PER_DAY, DEPOSIT);
      await tx.wait();

      const item = await bookRental.getItem(1);
      expect(item.owner).to.equal(owner.address);
      expect(item.ipfsCID).to.equal("ipfs://cid");
      expect(item.status).to.equal(0); // Available
    });

    it("Should revert if non-owner tries to list", async function () {
      await expect(
        bookRental.connect(otherUser).listItem("ipfs://cid", PRICE_PER_DAY, DEPOSIT)
      ).to.be.revertedWithCustomError(bookRental, "OwnableUnauthorizedAccount");
    });
  });

  describe("rentItem", function () {
    beforeEach(async function () {
      await bookRental.connect(owner).listItem("ipfs://cid", PRICE_PER_DAY, DEPOSIT);
    });

    it("Should successfully rent an item", async function () {
      const totalCost = PRICE_PER_DAY.add(DEPOSIT);
      await bookRental.connect(renter).rentItem(1, { value: totalCost });

      const item = await bookRental.getItem(1);
      expect(item.status).to.equal(1); // Rented
      expect(item.renter).to.equal(renter.address);
    });

    it("Should fail if rented already", async function () {
      const totalCost = PRICE_PER_DAY.add(DEPOSIT);
      await bookRental.connect(renter).rentItem(1, { value: totalCost });

      await expect(
        bookRental.connect(otherUser).rentItem(1, { value: totalCost })
      ).to.be.revertedWithCustomError(bookRental, "BookRental__InvalidStatus");
    });
    
    it("Should fail if zero or insufficient payment", async function () {
      await expect(
        bookRental.connect(renter).rentItem(1, { value: 0 })
      ).to.be.revertedWithCustomError(bookRental, "BookRental__InsufficientPayment");
    });
  });

  describe("returnItem", function () {
    beforeEach(async function () {
      await bookRental.connect(owner).listItem("ipfs://cid", PRICE_PER_DAY, DEPOSIT);
      const totalCost = PRICE_PER_DAY.add(DEPOSIT);
      await bookRental.connect(renter).rentItem(1, { value: totalCost });
    });

    it("Should allow renter to return", async function () {
      await bookRental.connect(renter).returnItem(1);
      const item = await bookRental.getItem(1);
      expect(item.status).to.equal(2); // AwaitingConfirm
    });
  });

  describe("confirmReturn", function () {
    beforeEach(async function () {
      await bookRental.connect(owner).listItem("ipfs://cid", PRICE_PER_DAY, DEPOSIT);
      const totalCost = PRICE_PER_DAY.add(DEPOSIT);
      await bookRental.connect(renter).rentItem(1, { value: totalCost });
      await bookRental.connect(renter).returnItem(1);
    });

    it("Should refund deposit to renter and close rental", async function () {
      // Returned immediately, so only 1 day is charged (which was paid upfront).
      // Renter gets back deposit.
      await expect(
        bookRental.connect(owner).confirmReturn(1)
      ).to.changeEtherBalances(
        [renter, owner],
        [DEPOSIT, PRICE_PER_DAY]
      );

      const item = await bookRental.getItem(1);
      expect(item.status).to.equal(0); // Available again
    });

    it("Should auto-refund to renter after 48 hours", async function () {
      await ethers.provider.send("evm_increaseTime", [48 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");

      // Renter can call confirmReturn themselves
      await expect(
        bookRental.connect(renter).confirmReturn(1)
      ).to.changeEtherBalances(
        [renter, owner],
        [DEPOSIT, PRICE_PER_DAY]
      );
    });
  });

  describe("raiseDispute & resolveDispute", function () {
    beforeEach(async function () {
      await bookRental.connect(owner).listItem("ipfs://cid", PRICE_PER_DAY, DEPOSIT);
      const totalCost = PRICE_PER_DAY.add(DEPOSIT);
      await bookRental.connect(renter).rentItem(1, { value: totalCost });
      await bookRental.connect(renter).returnItem(1);
    });

    it("Should allow renter to raise dispute", async function () {
      await bookRental.connect(renter).raiseDispute(1);
      const item = await bookRental.getItem(1);
      expect(item.status).to.equal(3); // InDispute
    });

    it("Should allow arbitrator to resolve dispute in owner's favour", async function () {
      await bookRental.connect(renter).raiseDispute(1);
      
      const totalPool = DEPOSIT.add(PRICE_PER_DAY);
      await expect(
        bookRental.connect(arbitrator).resolveDispute(1, owner.address)
      ).to.changeEtherBalances(
        [owner, renter],
        [totalPool, 0]
      );

      const item = await bookRental.getItem(1);
      expect(item.status).to.equal(0); // Available
    });
    
    it("Should revert if non-arbitrator resolves", async function () {
      await bookRental.connect(renter).raiseDispute(1);
      await expect(
        bookRental.connect(owner).resolveDispute(1, owner.address)
      ).to.be.revertedWithCustomError(bookRental, "BookRental__NotArbitrator");
    });
  });
});
