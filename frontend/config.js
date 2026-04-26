// Shared contract config — update this address after every deployment
const contractAddress = "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1";
const contractABI = [
    "function listItem(string _ipfsCID, uint256 _pricePerDay, uint256 _depositAmount) external returns (uint256)",
    "function rentItem(uint256 _itemId, bool _acceptedTerms) external payable",
    "function returnItem(uint256 _itemId) external",
    "function confirmReturn(uint256 _itemId) external",
    "function raiseDispute(uint256 _itemId) external",
    "function resolveDispute(uint256 _itemId, address _winner) external",
    "function items(uint256) external view returns (uint256 itemId, address owner, address renter, uint256 pricePerDay, uint256 depositAmount, string ipfsCID, uint8 status, uint256 rentedAt, uint256 returnedAt, uint256 disputeRaisedAt)",
    "function itemCounter() external view returns (uint256)",
    "function activeRentals(address) external view returns (uint256)",
    "function MAX_ACTIVE_RENTALS() external view returns (uint256)",
    "function STANDARD_RENTAL_PERIOD() external view returns (uint256)",
    "function registerAsArbitrator() external",
    "function unregisterAsArbitrator() external",
    "function getArbitratorCount() external view returns (uint256)",
    "function getArbitratorPool() external view returns (address[])",
    "function isArbitrator(address) external view returns (bool)",
    "function assignedArbitrator(uint256) external view returns (address)"
];

const STATUS_MAP = ["Available", "Rented", "AwaitingConfirm", "InDispute", "Closed"];

let provider, signer, contract;

async function connectWallet(connectBtn) {
    if (typeof window.ethereum === 'undefined') {
        showStatus('Please install MetaMask!', 'error');
        return false;
    }

    try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        contract = new ethers.Contract(contractAddress, contractABI, signer);

        const address = await signer.getAddress();
        connectBtn.innerText = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
        connectBtn.classList.add('connected');

        setupListeners(connectBtn);

        return true;
    } catch (error) {
        console.error("Connection error:", error);
        showStatus('Failed to connect: ' + error.message, 'error');
        return false;
    }
}

// Auto-connect: silently checks if wallet is already authorized (no popup)
async function autoConnect(connectBtn) {
    if (typeof window.ethereum === 'undefined') return false;

    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length === 0) return false; // Not connected yet

        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        contract = new ethers.Contract(contractAddress, contractABI, signer);

        const address = accounts[0];
        connectBtn.innerText = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
        connectBtn.classList.add('connected');

        setupListeners(connectBtn);

        return true;
    } catch (error) {
        console.error("Auto-connect error:", error);
        return false;
    }
}

function setupListeners(connectBtn) {
    // Remove old listeners to avoid duplicates
    window.ethereum.removeAllListeners?.('accountsChanged');
    window.ethereum.removeAllListeners?.('chainChanged');

    window.ethereum.on('accountsChanged', async (accounts) => {
        if (accounts.length > 0) {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
            contract = new ethers.Contract(contractAddress, contractABI, signer);
            const newAddr = accounts[0];
            connectBtn.innerText = `${newAddr.substring(0, 6)}...${newAddr.substring(newAddr.length - 4)}`;
            showStatus('Account switched!', 'success');
            if (typeof onAccountChanged === 'function') onAccountChanged();
        } else {
            window.location.reload();
        }
    });

    window.ethereum.on('chainChanged', () => window.location.reload());
}

function showStatus(message, type) {
    const el = document.getElementById('statusMessage');
    el.innerText = message;
    el.style.display = 'block';
    el.className = `status-message status-${type}`;
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}

async function loadAllItems() {
    let items = [];
    try {
        const count = await contract.itemCounter();
        const total = count.toNumber();
        console.log("Total items on chain:", total);
        
        for (let id = 1; id <= total; id++) {
            const item = await contract.items(id);
            items.push({ id, ...item });
        }
    } catch (error) {
        console.error("loadAllItems error:", error);
    }
    return items;
}
