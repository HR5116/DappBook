const { ethers } = require("hardhat");

async function main() {
    const [owner, renter] = await ethers.getSigners();
    const contract = await ethers.getContractAt("BookRental", "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1");

    // List book: price=0, deposit=1 ETH
    await contract.connect(owner).listItem("FreeBook", 0, ethers.utils.parseEther("1"));
    console.log("✅ Book listed with price=0, deposit=1 ETH");

    // Renter balance BEFORE
    const balBefore = await renter.getBalance();
    console.log("Renter balance BEFORE rent:", ethers.utils.formatEther(balBefore), "ETH");

    // Rent (pays 0 + 1 = 1 ETH)
    await contract.connect(renter).rentItem(1, true, { value: ethers.utils.parseEther("1") });
    const balAfterRent = await renter.getBalance();
    console.log("Renter balance AFTER rent: ", ethers.utils.formatEther(balAfterRent), "ETH");

    // Return
    await contract.connect(renter).returnItem(1);
    const balAfterReturn = await renter.getBalance();
    console.log("Renter balance AFTER return:", ethers.utils.formatEther(balAfterReturn), "ETH");

    // Owner confirms
    await contract.connect(owner).confirmReturn(1);

    // Renter balance AFTER confirm
    const balAfterConfirm = await renter.getBalance();
    console.log("Renter balance AFTER confirm:", ethers.utils.formatEther(balAfterConfirm), "ETH");
    
    const recovered = balAfterConfirm.sub(balAfterRent);
    console.log("\n💰 Deposit recovered:", ethers.utils.formatEther(recovered), "ETH (minus gas for return tx)");
}

main().catch(console.error);
