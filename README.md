# 📚 BookChain – Decentralized Book Rental Platform

**Project:** – Decentralised Book Rental

## Team Members
- Mohd Hassan Raza Ansari - 240008019
- Dhyan Chandra C - 240041014
- Manish Garasiya - 240041026
- Manjeet Kumar - 240041027
- Harsha Varshan Bonu - 240001020

---

## Project Overview

BookChain is a decentralized book rental platform built on Ethereum. It allows book owners (lenders) to list their books for rent, and readers (borrowers) to borrow them by paying a daily fee and a security deposit. The entire lifecycle — listing, borrowing, returning, confirming, and dispute resolution — is handled trustlessly through smart contracts.

---

## Project Features

### Core Rental Lifecycle
- **Book Listing**: Lenders add books to the library with a daily lending fee and a security deposit. Book metadata is referenced via an IPFS CID.
- **Borrowing**: Readers pay the security deposit + 1 day's fee upfront to borrow a book. They must accept Terms & Conditions before proceeding.
- **Returning**: Readers return books, switching the book's status to `AwaitingConfirm`.
- **Confirm Return**: The lender confirms the book was returned in good condition. The smart contract calculates the rental cost and refunds the security deposit to the reader.
- **48-Hour Auto-Confirm**: If the lender fails to confirm within 48 hours, the reader (or anyone) can trigger the confirmation to claim their refund.

### Rental Constraints
- **Active Rental Limit**: Each reader can borrow a maximum of **5 books** at a time.
- **Late Return Penalty**: Books kept beyond **7 days** incur a **2x daily rate** penalty for each overdue day.
- **Terms of Service**: Readers must accept a liability checkbox before borrowing.
- **Zero-Fee Lending**: Lenders can list books for free (0 ETH fee) — a confirmation prompt warns them before proceeding.

### Dispute Resolution
- **Raise Dispute**: If a book is returned damaged, the lender (or renter) can raise a dispute while the book is in `AwaitingConfirm` status.
- **Random Arbitrator Pool**: Disputes are assigned to a **randomly selected arbitrator** from a registered pool, using `block.prevrandao` for pseudo-random selection. The lender and reader involved are excluded from selection.
- **Fallback Arbitrator**: The contract deployer is auto-registered as the first arbitrator, so disputes can always be raised even if nobody else has registered.
- **Resolve Dispute**: Only the assigned arbitrator can resolve the dispute. They choose the winner, and all locked funds (deposit + fee) are transferred to the winner.

### Multi-Page Frontend
| Page | Role | Actions |
|------|------|---------|
| **Lender's Shelf** | Book Owner | Add books, confirm returns, report damaged books |
| **Library Catalog** | Reader | Browse catalog, borrow books, return books, raise disputes |
| **Arbitrator Panel** | Arbitrator | Register/unregister, view assigned disputes, resolve disputes |

---

## Tech Stack
- **Smart Contract**: Solidity ^0.8.20, OpenZeppelin (Ownable, ReentrancyGuard)
- **Development**: Hardhat
- **Frontend**: Vanilla HTML/CSS/JS with ethers.js v5.7.2
- **Wallet**: MetaMask
- **Styling**: Custom warm library theme with Playfair Display serif typography

---

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- npm
- MetaMask browser extension

### Installation & Deployment

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Compile the smart contract:**
   ```bash
   npx hardhat compile
   ```

3. **Start a local Hardhat node** (Terminal 1):
   ```bash
   npx hardhat node
   ```

4. **Deploy the contract** (Terminal 2):
   ```bash
   npx hardhat run scripts/deploy.js --network localhost
   ```
   Copy the deployed contract address from the output.

5. **Update the frontend config:**
   Open `frontend/config.js` and replace the `contractAddress` value with the new deployed address.

6. **Start the frontend server** (Terminal 3):
   ```bash
   cd frontend
   python3 -m http.server 8000
   ```
   Open `http://localhost:8000` in your browser.

7. **Connect MetaMask:**
   - Add the Hardhat network to MetaMask (RPC: `http://127.0.0.1:8545`, Chain ID: `31337`).
   - Import Hardhat test accounts using the private keys printed when the node started.

### Running Tests
```bash
npx hardhat test
npx hardhat coverage
```

---

## Project Structure
```
DAppBook/
├── contracts/
│   └── BookRental.sol          # Main smart contract
├── scripts/
│   └── deploy.js               # Deployment script
├── test/
│   └── BookRental.test.js      # Test suite
├── frontend/
│   ├── index.html              # Landing page
│   ├── owner.html              # Lender dashboard
│   ├── renter.html             # Reader / library catalog
│   ├── arbitrator.html         # Arbitrator panel
│   ├── config.js               # Shared contract ABI, address, wallet logic
│   ├── owner.js                # Lender page logic
│   ├── renter.js               # Reader page logic
│   ├── arbitrator.js           # Arbitrator page logic
│   └── style.css               # Library-themed UI styles
├── hardhat.config.js
└── package.json
```

---

## Gas Optimisation

**Optimisations Applied:**
- Replaced string-based `require()` statements with **Custom Errors** (e.g., `if (...) revert BookRental__InvalidPrice()`)
- Switched postfix increments (`counter++`) to prefix increments (`++counter`)

| Metric | Before | After |
|--------|--------|-------|
| Deployment Cost | ~1,100,000 gas | 1,064,310 gas |
| `listItem` Execution | ~226,500 gas | 225,911 gas |

**Reasoning:** Custom errors eliminate on-chain string storage and encode to a compact 4-byte selector, reducing both deployment and runtime gas costs. Prefix increments avoid caching the previous variable state.

---

## Off-Chain vs On-Chain Data

We have strictly adhered to privacy requirements:

| Location | Data Stored |
|----------|-------------|
| **On-Chain** | Prices, statuses, timestamps, IPFS CID reference, wallet addresses |
| **Off-Chain (IPFS)** | Book titles, descriptions, cover images, and any personal information |

---

## Smart Contract Details

### Key Functions
| Function | Who | Description |
|----------|-----|-------------|
| `listItem()` | Lender | Add a book with daily fee + deposit |
| `rentItem()` | Reader | Borrow a book (pays deposit + 1 day fee) |
| `returnItem()` | Reader | Mark a book as returned |
| `confirmReturn()` | Lender / Anyone after 48h | Confirm return, trigger refund |
| `raiseDispute()` | Lender or Reader | Raise dispute on a returned book |
| `resolveDispute()` | Assigned Arbitrator | Resolve dispute, send funds to winner |
| `registerAsArbitrator()` | Anyone | Join the arbitrator pool |
| `unregisterAsArbitrator()` | Arbitrator | Leave the pool |

### Security Features
- **ReentrancyGuard**: All functions involving ETH transfers are protected against reentrancy attacks.
- **Custom Errors**: Gas-efficient error handling with descriptive error names.
- **Access Control**: Only the book owner, assigned renter, or assigned arbitrator can perform their respective actions.
- **Pseudo-Random Arbitrator Selection**: Uses `keccak256(block.prevrandao, block.timestamp, itemId)` for randomized dispute assignment.

---

## Known Issues / Limitations
- The IPFS CID requires pinning; if unpinned, book metadata may become unavailable.
- The random arbitrator selection uses `block.prevrandao`, which is suitable for a student project but not for high-stakes mainnet production (miners can influence it).
- Currently designed for Hardhat localhost testing; testnet deployment configuration is not yet included.
- MetaMask does not display internal transactions (contract → wallet refunds) in the activity tab — users must check their balance directly.
- The `activeRentals` counter relies on clean `confirmReturn` or `resolveDispute` calls. Interrupted flows may leave the counter stale.

---

## License
MIT
