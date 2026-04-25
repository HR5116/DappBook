const contractAddress = "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318"; // Localhost deploy address
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
            
            // Load available items
            await loadItems();
            
            // Listen for account changes in MetaMask
            window.ethereum.on('accountsChanged', async (accounts) => {
                if (accounts.length > 0) {
                    provider = new ethers.providers.Web3Provider(window.ethereum);
                    signer = provider.getSigner();
                    contract = new ethers.Contract(contractAddress, contractABI, signer);
                    
                    const newAddress = accounts[0];
                    connectBtn.innerText = `${newAddress.substring(0, 6)}...${newAddress.substring(newAddress.length - 4)}`;
                    console.log("MetaMask Account Switched to:", newAddress);
                    showStatus('MetaMask Account switched!', 'success');
                } else {
                    window.location.reload();
                }
            });
            
            // Listen for network changes in MetaMask
            window.ethereum.on('chainChanged', () => {
                window.location.reload();
            });

        } catch (error) {
            console.error("Connection Debugger:", error);
            showStatus('Failed to connect wallet: ' + error.message, 'error');
        }
    } else {
        showStatus('Please install MetaMask!', 'error');
    }
});

// Load Items
async function loadItems() {
    const itemsList = document.getElementById('itemsList');
    itemsList.innerHTML = '<p>Loading items...</p>';
    
    try {
        let itemsHtml = '';
        let itemId = 1;
        let hasItems = false;
        
        while (true) {
            const item = await contract.items(itemId);
            // If owner is address(0), we reached the end of the listed items
            if (item.owner === "0x0000000000000000000000000000000000000000") {
                break;
            }
            hasItems = true;
            
            const statusMap = ["Available", "Rented", "AwaitingConfirm", "InDispute", "Closed"];
            const statusText = statusMap[item.status];
            
            itemsHtml += `
                <div class="item-card">
                    <h4>Item #${itemId}</h4>
                    <span class="status-badge status-${item.status}">${statusText}</span>
                    <p><strong>CID:</strong> ${item.ipfsCID}</p>
                    <p title="${item.owner}"><strong>Owner:</strong> ${item.owner.substring(0,6)}...${item.owner.substring(38)}</p>
                    <p><strong>Daily Price:</strong> ${ethers.utils.formatEther(item.pricePerDay)} ETH</p>
                    <p><strong>Deposit:</strong> ${ethers.utils.formatEther(item.depositAmount)} ETH</p>
                </div>
            `;
            itemId++;
        }
        
        if (!hasItems) {
            itemsList.innerHTML = '<p>No items listed yet.</p>';
        } else {
            itemsList.innerHTML = itemsHtml;
        }
    } catch (error) {
        console.error("Error loading items:", error);
        itemsList.innerHTML = '<p class="status-error">Failed to load items: ' + (error.message || error) + '</p>';
    }
}

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
        await loadItems(); // Refresh items
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
        await loadItems(); // Refresh items
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

// Return Book
document.getElementById('returnBookForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('returnBookId').value;
    
    try {
        const tx = await contract.returnItem(itemId);
        showStatus('Return submitted. Waiting for confirmation...', 'success');
        
        await tx.wait();
        showStatus(`Item returned successfully! Tx Hash: ${tx.hash}`, 'success');
        document.getElementById('returnBookForm').reset();
        await loadItems(); // Refresh items
    } catch (error) {
        console.error("Return Debugger:", error);
        showStatus('Failed to return item: ' + (error.data?.message || error.message), 'error');
    }
});

// Confirm Return
document.getElementById('confirmBookForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('confirmBookId').value;
    
    try {
        const tx = await contract.confirmReturn(itemId);
        showStatus('Confirm submitted. Waiting for confirmation...', 'success');
        
        await tx.wait();
        showStatus(`Return confirmed successfully! Tx Hash: ${tx.hash}`, 'success');
        document.getElementById('confirmBookForm').reset();
        await loadItems(); // Refresh items
    } catch (error) {
        console.error("Confirm Debugger:", error);
        showStatus('Failed to confirm return: ' + (error.data?.message || error.message), 'error');
    }
});

// Raise Dispute
document.getElementById('disputeBookForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('disputeBookId').value;
    
    try {
        const tx = await contract.raiseDispute(itemId);
        showStatus('Dispute submitted. Waiting for confirmation...', 'success');
        
        await tx.wait();
        showStatus(`Dispute raised successfully! Tx Hash: ${tx.hash}`, 'success');
        document.getElementById('disputeBookForm').reset();
        await loadItems(); // Refresh items
    } catch (error) {
        console.error("Dispute Debugger:", error);
        showStatus('Failed to raise dispute: ' + (error.data?.message || error.message), 'error');
    }
});
