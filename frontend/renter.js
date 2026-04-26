const connectBtn = document.getElementById('connectBtn');
const dashboard = document.getElementById('dashboard');

let allLoadedItems = [];

// Auto-connect on page load if wallet was already connected
window.addEventListener('load', async () => {
    const ok = await autoConnect(connectBtn);
    if (ok) {
        dashboard.classList.remove('hidden');
        await refreshMarketplace();
        await updateRentalCount();
    }
});

connectBtn.addEventListener('click', async () => {
    const ok = await connectWallet(connectBtn);
    if (ok) {
        dashboard.classList.remove('hidden');
        await refreshMarketplace();
        await updateRentalCount();
    }
});

// Called when MetaMask account switches
function onAccountChanged() {
    refreshMarketplace();
    updateRentalCount();
}

async function updateRentalCount() {
    try {
        const addr = await signer.getAddress();
        const count = await contract.activeRentals(addr);
        document.getElementById('rentalCount').innerText = `📚 Books Borrowed: ${count.toNumber()} / 5`;
    } catch (e) {
        console.error("Rental count error:", e);
    }
}

// Load & render marketplace
async function refreshMarketplace() {
    const container = document.getElementById('marketplace');
    container.innerHTML = '<p style="color: var(--text-muted);">Loading library catalog...</p>';

    try {
        allLoadedItems = await loadAllItems();
        renderItems(allLoadedItems);
    } catch (error) {
        console.error("Marketplace error:", error);
        container.innerHTML = '<p style="color: var(--error);">Failed to load library catalog.</p>';
    }
}

function renderItems(items) {
    const container = document.getElementById('marketplace');

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📭</div>
                <p>No books found on the shelf.</p>
            </div>`;
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="item-card fade-in">
            <div class="item-header">
                <h4>Book #${item.id}</h4>
                <span class="badge ${getBadgeClass(item.status)}">${STATUS_MAP[item.status]}</span>
            </div>
            <p class="detail"><strong>Title:</strong> ${item.ipfsCID}</p>
            <p class="detail" title="${item.owner}"><strong>Lender:</strong> ${item.owner.substring(0,6)}...${item.owner.substring(38)}</p>
            <p class="detail"><strong>Fee:</strong> ${ethers.utils.formatEther(item.pricePerDay)} ETH/day</p>
            <p class="detail"><strong>Deposit:</strong> ${ethers.utils.formatEther(item.depositAmount)} ETH</p>
            <p class="detail"><strong>Total to Borrow:</strong> ${ethers.utils.formatEther(item.pricePerDay.add(item.depositAmount))} ETH</p>
        </div>
    `).join('');
}

function getBadgeClass(status) {
    return ['badge-available', 'badge-rented', 'badge-awaiting', 'badge-dispute', 'badge-closed'][status] || '';
}

// Search
document.getElementById('searchBar').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
        renderItems(allLoadedItems);
        return;
    }
    const filtered = allLoadedItems.filter(item =>
        item.id.toString().includes(query) ||
        item.ipfsCID.toLowerCase().includes(query) ||
        item.owner.toLowerCase().includes(query) ||
        STATUS_MAP[item.status].toLowerCase().includes(query)
    );
    renderItems(filtered);
});

// Rent Item
document.getElementById('rentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('rentId').value;
    const termsChecked = document.getElementById('acceptTerms').checked;

    if (!termsChecked) {
        showStatus('Please accept the borrowing terms before checking out a book!', 'error');
        return;
    }

    try {
        const item = await contract.items(itemId);
        const totalCost = item.pricePerDay.add(item.depositAmount);

        const tx = await contract.rentItem(itemId, true, { value: totalCost });
        showStatus('Borrowing book... please wait...', 'success');
        await tx.wait();
        showStatus(`📖 Book borrowed successfully! Happy reading! Tx: ${tx.hash.substring(0, 14)}...`, 'success');
        document.getElementById('rentForm').reset();
        await refreshMarketplace();
        await updateRentalCount();
    } catch (error) {
        console.error("Rent error:", error);
        const msg = error.reason || error.data?.message || error.message;
        if (msg.includes('MaxRentalsReached')) {
            showStatus('You already have 5 books borrowed — please return one before borrowing another!', 'error');
        } else {
            showStatus('Failed: ' + msg, 'error');
        }
    }
});

// Return Item
document.getElementById('returnForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('returnId').value;

    try {
        const item = await contract.items(itemId);
        const depositStr = ethers.utils.formatEther(item.depositAmount);

        const tx = await contract.returnItem(itemId);
        showStatus('Returning book to the shelf...', 'success');
        await tx.wait();
        showStatus(
            `📤 Book #${itemId} marked as returned! Your security deposit (${depositStr} ETH) will be refunded once the lender confirms the return.`,
            'success'
        );
        document.getElementById('returnForm').reset();
        await refreshMarketplace();
    } catch (error) {
        console.error("Return error:", error);
        showStatus('Failed: ' + (error.reason || error.data?.message || error.message), 'error');
    }
});

// Raise Dispute (Renter)
document.getElementById('disputeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('disputeId').value;

    try {
        // Check the item status first to give a helpful error
        const item = await contract.items(itemId);
        if (item.status === 1) { // Rented
            showStatus('You must return the book first before raising a dispute!', 'error');
            return;
        }
        if (item.status !== 2) { // Not AwaitingConfirm
            showStatus('Disputes can only be raised after the book has been returned and is awaiting confirmation.', 'error');
            return;
        }

        const tx = await contract.raiseDispute(itemId);
        showStatus('Raising dispute about this book...', 'success');
        await tx.wait();
        showStatus(`⚠️ Dispute raised! A random arbitrator will review your case. Tx: ${tx.hash.substring(0, 14)}...`, 'success');
        document.getElementById('disputeForm').reset();
        await refreshMarketplace();
    } catch (error) {
        console.error("Dispute error:", error);
        showStatus('Failed: ' + (error.reason || error.data?.message || error.message), 'error');
    }
});
