const connectBtn = document.getElementById('connectBtn');
const dashboard = document.getElementById('dashboard');

// Auto-connect on page load
window.addEventListener('load', async () => {
    const ok = await autoConnect(connectBtn);
    if (ok) {
        dashboard.classList.remove('hidden');
        await refreshAll();
    }
});

connectBtn.addEventListener('click', async () => {
    const ok = await connectWallet(connectBtn);
    if (ok) {
        dashboard.classList.remove('hidden');
        await refreshAll();
    }
});

function onAccountChanged() {
    refreshAll();
}

async function refreshAll() {
    await checkArbitratorStatus();
    await loadMyDisputes();
    await loadPool();
}

// Check if current user is registered as arbitrator
async function checkArbitratorStatus() {
    try {
        const myAddress = await signer.getAddress();
        const registered = await contract.isArbitrator(myAddress);
        const count = await contract.getArbitratorCount();
        const arbInfo = document.getElementById('arbInfo');
        const registerBtn = document.getElementById('registerBtn');
        const unregisterBtn = document.getElementById('unregisterBtn');
        
        document.getElementById('poolCount').innerText = `Pool size: ${count.toNumber()} arbitrators registered`;

        if (registered) {
            arbInfo.style.color = 'var(--success)';
            arbInfo.innerText = `✅ You are a registered arbitrator!`;
            registerBtn.style.display = 'none';
            unregisterBtn.style.display = 'block';
        } else {
            arbInfo.style.color = 'var(--warning)';
            arbInfo.innerText = `⚠️ You are NOT registered as an arbitrator. Register below to start resolving disputes.`;
            registerBtn.style.display = 'block';
            unregisterBtn.style.display = 'none';
        }
    } catch (e) {
        console.error("Status check error:", e);
    }
}

// Register
document.getElementById('registerBtn').addEventListener('click', async () => {
    try {
        const tx = await contract.registerAsArbitrator();
        showStatus('Registering...', 'success');
        await tx.wait();
        showStatus('You are now a registered arbitrator! 🎉', 'success');
        await refreshAll();
    } catch (error) {
        console.error("Register error:", error);
        showStatus('Failed: ' + (error.reason || error.data?.message || error.message), 'error');
    }
});

// Unregister
document.getElementById('unregisterBtn').addEventListener('click', async () => {
    try {
        const tx = await contract.unregisterAsArbitrator();
        showStatus('Unregistering...', 'success');
        await tx.wait();
        showStatus('You have been removed from the arbitrator pool.', 'success');
        await refreshAll();
    } catch (error) {
        console.error("Unregister error:", error);
        showStatus('Failed: ' + (error.reason || error.data?.message || error.message), 'error');
    }
});

// Load disputes assigned to the current user
async function loadMyDisputes() {
    const container = document.getElementById('myDisputes');
    container.innerHTML = '<p style="color: var(--text-muted);">Loading...</p>';

    try {
        const myAddress = (await signer.getAddress()).toLowerCase();
        const allItems = await loadAllItems();
        
        // Find items in dispute that are assigned to me
        const myDisputes = [];
        for (const item of allItems) {
            if (item.status === 3) { // InDispute
                const assigned = await contract.assignedArbitrator(item.id);
                if (assigned.toLowerCase() === myAddress) {
                    myDisputes.push({ ...item, assignedArb: assigned });
                }
            }
        }

        if (myDisputes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">✅</div>
                    <p>No disputes assigned to you. All clear!</p>
                </div>`;
            return;
        }

        container.innerHTML = myDisputes.map(item => `
            <div class="item-card fade-in" style="border-color: rgba(139, 92, 246, 0.3);">
                <div class="item-header">
                    <h4>Book #${item.id}</h4>
                    <span class="badge badge-dispute">ASSIGNED TO YOU</span>
                </div>
                <p class="detail"><strong>Title:</strong> ${item.ipfsCID}</p>
                <p class="detail"><strong>Lender:</strong> <span style="color: var(--warning);">${item.owner}</span></p>
                <p class="detail"><strong>Borrower:</strong> <span style="color: var(--primary);">${item.renter}</span></p>
                <p class="detail"><strong>Locked Funds:</strong> ${ethers.utils.formatEther(item.pricePerDay.add(item.depositAmount))} ETH</p>
                <p class="detail"><strong>Disputed At:</strong> ${new Date(item.disputeRaisedAt.toNumber() * 1000).toLocaleString()}</p>
            </div>
        `).join('');
    } catch (error) {
        console.error("Load disputes error:", error);
        container.innerHTML = '<p style="color: var(--error);">Failed to load disputes.</p>';
    }
}

// Load all arbitrators in the pool
async function loadPool() {
    const container = document.getElementById('poolList');
    try {
        const pool = await contract.getArbitratorPool();
        
        if (pool.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📭</div>
                    <p>No arbitrators registered yet. Be the first!</p>
                </div>`;
            return;
        }

        container.innerHTML = pool.map((addr, i) => `
            <div class="item-card fade-in">
                <div class="item-header">
                    <h4>Arbitrator #${i + 1}</h4>
                    <span class="badge badge-available">ACTIVE</span>
                </div>
                <p class="detail" title="${addr}"><strong>Address:</strong> ${addr.substring(0,10)}...${addr.substring(38)}</p>
            </div>
        `).join('');
    } catch (error) {
        console.error("Load pool error:", error);
        container.innerHTML = '<p style="color: var(--error);">Failed to load pool.</p>';
    }
}

function getBadgeClass(status) {
    return ['badge-available', 'badge-rented', 'badge-awaiting', 'badge-dispute', 'badge-closed'][status] || '';
}

// Resolve Dispute
document.getElementById('resolveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemId = document.getElementById('resolveId').value;
    const winner = document.getElementById('winnerAddress').value;

    try {
        const tx = await contract.resolveDispute(itemId, winner);
        showStatus('Resolving book dispute...', 'success');
        await tx.wait();
        showStatus(`⚖️ Dispute resolved! Locked funds sent to the winner. Tx: ${tx.hash.substring(0, 14)}...`, 'success');
        document.getElementById('resolveForm').reset();
        await refreshAll();
    } catch (error) {
        console.error("Resolve error:", error);
        const msg = error.reason || error.data?.message || error.message;
        if (msg.includes('NotArbitrator')) {
            showStatus('You are NOT the assigned arbitrator for this dispute!', 'error');
        } else {
            showStatus('Failed: ' + msg, 'error');
        }
    }
});
