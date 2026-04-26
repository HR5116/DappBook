const connectBtn = document.getElementById('connectBtn');
const dashboard = document.getElementById('dashboard');

// Auto-connect on page load if wallet was already connected
window.addEventListener('load', async () => {
    const ok = await autoConnect(connectBtn);
    if (ok) {
        dashboard.classList.remove('hidden');
        loadMyItems();
    }
});

connectBtn.addEventListener('click', async () => {
    const ok = await connectWallet(connectBtn);
    if (ok) {
        dashboard.classList.remove('hidden');
        loadMyItems();
    }
});

// Called when MetaMask account switches
function onAccountChanged() {
    loadMyItems();
}

// Load items owned by the connected wallet
async function loadMyItems() {
    const container = document.getElementById('myItems');
    container.innerHTML = '<p style="color: var(--text-muted);">Loading...</p>';

    try {
        const allItems = await loadAllItems();
        const myAddress = (await signer.getAddress()).toLowerCase();
        const myItems = allItems.filter(i => i.owner.toLowerCase() === myAddress);

        if (myItems.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📭</div>
                    <p>You haven't listed any items yet.</p>
                </div>`;
            return;
        }

        container.innerHTML = myItems.map(item => `
            <div class="item-card fade-in">
                <div class="item-header">
                    <h4>Book #${item.id}</h4>
                    <span class="badge ${getBadgeClass(item.status)}">${STATUS_MAP[item.status]}</span>
                </div>
                <p class="detail"><strong>Title:</strong> ${item.ipfsCID}</p>
                <p class="detail"><strong>Fee:</strong> ${ethers.utils.formatEther(item.pricePerDay)} ETH/day</p>
                <p class="detail"><strong>Deposit:</strong> ${ethers.utils.formatEther(item.depositAmount)} ETH</p>
                ${item.renter !== "0x0000000000000000000000000000000000000000" 
                    ? `<p class="detail"><strong>Borrower:</strong> ${item.renter.substring(0,6)}...${item.renter.substring(38)}</p>` 
                    : ''}
            </div>
        `).join('');
    } catch (error) {
        console.error("Load my items error:", error);
        container.innerHTML = '<p style="color: var(--error);">Failed to load items.</p>';
    }
}

function getBadgeClass(status) {
    return ['badge-available', 'badge-rented', 'badge-awaiting', 'badge-dispute', 'badge-closed'][status] || '';
}

// List Item
document.getElementById('listBookForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cid = document.getElementById('ipfsCID').value;
    const price = document.getElementById('dailyPrice').value;
    const deposit = document.getElementById('deposit').value;

    // Warn if price is zero (free lending)
    if (parseFloat(price) === 0) {
        const sure = confirm(
            "⚠️ Are you sure you want to lend this book for FREE?\n\n" +
            "Setting the daily fee to 0 means you won't earn anything from lending this book. " +
            "Readers will only need to pay the security deposit.\n\n" +
            "Click OK to continue, or Cancel to go back."
        );
        if (!sure) return;
    }

    // Warn if deposit is zero (no protection)
    if (parseFloat(deposit) === 0) {
        const sure = confirm(
            "⚠️ Are you sure you want NO security deposit?\n\n" +
            "Without a deposit, there's no financial protection if the borrower damages or doesn't return your book.\n\n" +
            "Click OK to continue, or Cancel to go back."
        );
        if (!sure) return;
    }

    try {
        const tx = await contract.listItem(cid, ethers.utils.parseEther(price), ethers.utils.parseEther(deposit));
        showStatus('Adding your book to the shelf...', 'success');
        await tx.wait();
        showStatus(`📖 Book added to the library shelf! Tx: ${tx.hash.substring(0, 14)}...`, 'success');
        document.getElementById('listBookForm').reset();
        loadMyItems();
    } catch (error) {
        console.error("List error:", error);
        showStatus('Failed: ' + (error.reason || error.data?.message || error.message), 'error');
    }
});

// Confirm Return
document.getElementById('confirmForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('confirmId').value;

    try {
        // Get item details before confirming so we can show the refund info
        const item = await contract.items(itemId);
        const depositStr = ethers.utils.formatEther(item.depositAmount);
        const renterAddr = item.renter.substring(0,6) + '...' + item.renter.substring(38);

        const tx = await contract.confirmReturn(itemId);
        showStatus('Confirming book return...', 'success');
        await tx.wait();
        showStatus(
            `✅ Return confirmed! Deposit (${depositStr} ETH) has been refunded to renter ${renterAddr}. You received the rental fee.`,
            'success'
        );
        document.getElementById('confirmForm').reset();
        loadMyItems();
    } catch (error) {
        console.error("Confirm error:", error);
        showStatus('Failed: ' + (error.reason || error.data?.message || error.message), 'error');
    }
});

// Raise Dispute (Owner)
document.getElementById('disputeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('disputeId').value;

    try {
        const tx = await contract.raiseDispute(itemId);
        showStatus('Reporting issue with the book...', 'success');
        await tx.wait();
        showStatus(`⚠️ Dispute raised about the book! A random arbitrator will be assigned. Tx: ${tx.hash.substring(0, 14)}...`, 'success');
        document.getElementById('disputeForm').reset();
        loadMyItems();
    } catch (error) {
        console.error("Dispute error:", error);
        showStatus('Failed: ' + (error.reason || error.data?.message || error.message), 'error');
    }
});
