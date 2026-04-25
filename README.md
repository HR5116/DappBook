# Decentralized Book Rental Platform

**Project Number:** Project 1 – Decentralised Book Rental

## Team Members
- Dhyan Chandra C - 240041014
- [Member 2 Name] - [Roll Number 2]
- *(Add missing members here)*

## Project Features
- **Item Listing**: Owners list books with a daily rate and deposit, metadata stored via IPFS CID.
- **Renting**: Renters pay deposit + 1 day fee upfront.
- **Returning**: Renters return items, switching state to `AwaitingConfirm`.
- **48-Hour Auto-Refund**: If the owner fails to confirm the return within 48 hours, the renter can claim their refund directly.
- **Disputes**: Renters can raise disputes, and an **Arbitrator** resolves them, refunding the appropriate party.

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- npm
- Hardhat
- MetaMask wallet (browser extension)

### Commands
1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Compile Smart Contracts:**
   ```bash
   npx hardhat compile
   ```

3. **Run Tests & Coverage:**
   ```bash
   npx hardhat test
   npx hardhat coverage
   ```

4. **Deploy Locally (for frontend):**
   First, run a local node:
   ```bash
   npx hardhat node
   ```
   In a separate terminal, deploy the contract:
   ```bash
   npx hardhat run scripts/deploy.js --network localhost
   ```
   Update the `contractAddress` inside `frontend/app.js` with the deployed address.
   Then open `frontend/index.html` in your browser.

## Gas Optimisation
**Optimisation Applied:** Replaced string `require` statements with **Custom Errors** (e.g., `if (...) revert BookRental__InvalidPrice()`). We also switched postfix increments (`counter++`) to prefix increments (`++counter`).

**Before:**
- Deployment Cost: ~1,100,000 gas
- `listItem` execution: ~226,500 gas

**After:**
- Deployment Cost: 1,064,310 gas
- `listItem` execution: 225,911 gas

**Reasoning:** 
Using custom errors eliminates the need to store revert strings on-chain, which saves deployment gas. It also provides cheaper revert mechanisms during execution because custom errors encode to a 4-byte selector instead of expanding the revert data with a long string. Prefix increments save gas by avoiding the caching of the previous variable state before returning.

## Off-Chain vs On-Chain Data
We have strictly adhered to the privacy requirements:
- **On-Chain**: Prices, Statuses, Timestamps, and the IPFS CID (`ipfsCID`).
- **Off-Chain**: Book names, descriptions, images, and any personal information are kept strictly on IPFS or an off-chain server.

## Known Issues / Limitations
- Off-chain IPFS CID requires pinning; if unpinned by the host, metadata might become unavailable.
- Testnet deployment commands have not yet been strictly added; currently focusing on Hardhat localhost testing.
