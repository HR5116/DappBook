const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Localhost deploy address
const contractABI = [
    "function listItem(string _ipfsCID, uint256 _pricePerDay, uint256 _depositAmount) external returns (uint256)",
    "function rentItem(uint256 _itemId) external payable",
    "function returnItem(uint256 _itemId) external",
    "function confirmReturn(uint256 _itemId) external",
    "function raiseDispute(uint256 _itemId) external",
    "function items(uint256) external view returns (uint256 itemId, address owner, address renter, uint256 pricePerDay, uint256 depositAmount, string ipfsCID, uint8 status, uint256 rentedAt, uint256 returnedAt, uint256 disputeRaisedAt)"
];

let provider;
let signer;
let contract;

const connectBtn = document.getElementById('connectBtn');
const dashboard = document.getElementById('dashboard');
const statusMessage = document.getElementById('statusMessage');

// Connect Wallet
connectBtn.addEventListener('click', async () => {
    if (typeof window.ethereum !== 'undefined') {
        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
            contract = new ethers.Contract(contractAddress, contractABI, signer);
            
            const address = await signer.getAddress();
            connectBtn.innerText = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
            connectBtn.style.background = 'var(--success)';
            
            dashboard.classList.remove('hidden');
            showStatus('Wallet connected successfully!', 'success');
        } catch (error) {
            showStatus('Failed to connect wallet: ' + error.message, 'error');
        }
    } else {
        showStatus('Please install MetaMask!', 'error');
    }
});

// List Book
document.getElementById('listBookForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cid = document.getElementById('ipfsCID').value;
    const price = document.getElementById('dailyPrice').value;
    const deposit = document.getElementById('deposit').value;
    
    try {
        const tx = await contract.listItem(
            cid, 
            ethers.utils.parseEther(price.toString()), 
            ethers.utils.parseEther(deposit.toString())
        );
        showStatus('Transaction submitted. Waiting for confirmation...', 'success');
        
        await tx.wait();
        showStatus(`Item listed successfully! Tx Hash: ${tx.hash}`, 'success');
        document.getElementById('listBookForm').reset();
    } catch (error) {
        showStatus('Failed to list item: ' + (error.data?.message || error.message), 'error');
    }
});

// Rent Book
document.getElementById('rentBookForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('bookId').value;
    
    try {
        const item = await contract.items(itemId);
        const dailyPrice = item.pricePerDay;
        const deposit = item.depositAmount;
        
        // Renter pays deposit + first day fee upfront
        const totalCost = dailyPrice.add(deposit);
        
        const tx = await contract.rentItem(itemId, { value: totalCost });
        showStatus('Transaction submitted. Waiting for confirmation...', 'success');
        
        await tx.wait();
        showStatus(`Item rented successfully! Tx Hash: ${tx.hash}`, 'success');
        document.getElementById('rentBookForm').reset();
    } catch (error) {
        showStatus('Failed to rent item: ' + (error.data?.message || error.message), 'error');
    }
});

function showStatus(message, type) {
    statusMessage.innerText = message;
    statusMessage.style.display = 'block';
    statusMessage.className = `status-message status-${type}`;
    
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 5000);
}
