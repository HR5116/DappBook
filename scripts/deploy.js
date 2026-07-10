const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() 
{
  const [deployer] = await hre.ethers.getSigners();
  const BookRental = await hre.ethers.getContractFactory("BookRental");
  const bookRental = await BookRental.deploy();
  await bookRental.deployed();
  console.log(`BookRental deployed to ${bookRental.address}`);
  console.log(`Deployer (${deployer.address}) auto-registered as fallback arbitrator`);

  // Auto-update frontend/config.js with the new address
  const configPath = path.join(__dirname, "..", "frontend", "config.js");
  if (fs.existsSync(configPath)) 
    {
    let config = fs.readFileSync(configPath, "utf8");
    config = config.replace(
      /const contractAddress = "0x[a-fA-F0-9]+";/,
      `const contractAddress = "${bookRental.address}";`
    );
    fs.writeFileSync(configPath, config);
    console.log(`✅ frontend/config.js updated with new address`);
  }
}

main().catch((error) => 
{
  console.error(error);
  process.exitCode = 1;
});
