const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
  const contractAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
  const contractABI = [
    "function items(uint256) external view returns (uint256 itemId, address owner, address renter, uint256 pricePerDay, uint256 depositAmount, string ipfsCID, uint8 status, uint256 rentedAt, uint256 returnedAt, uint256 disputeRaisedAt)"
  ];
  
  const contract = new ethers.Contract(contractAddress, contractABI, provider);
  
  try {
    const item = await contract.items(1);
    console.log("Success:", item);
    console.log("Owner:", item.owner);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
