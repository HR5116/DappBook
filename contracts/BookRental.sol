// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Decentralized Book Rental Platform
/// @notice Uses a random arbitrator pool — a different arbitrator is picked for every dispute
contract BookRental is ReentrancyGuard, Ownable {
    error BookRental__NotArbitrator();
    error BookRental__NotItemOwner();
    error BookRental__NotRenter();
    error BookRental__InvalidStatus();
    error BookRental__InsufficientPayment();
    error BookRental__IPFSCIDRequired();
    error BookRental__InvalidPrice();
    error BookRental__DepositTooLow();
    error BookRental__CannotRentOwnItem();
    error BookRental__Unauthorized();
    error BookRental__MaxRentalsReached();
    error BookRental__TermsNotAccepted();
    error BookRental__AlreadyRegistered();
    error BookRental__NotRegistered();
    error BookRental__NoEligibleArbitrators();

    enum Status { Available, Rented, AwaitingConfirm, InDispute, Closed }

    uint256 public constant MAX_ACTIVE_RENTALS = 5;
    uint256 public constant STANDARD_RENTAL_PERIOD = 7 days;

    struct Item {
        uint256 itemId;
        address payable owner;
        address payable renter;
        uint256 pricePerDay;
        uint256 depositAmount;
        string ipfsCID;
        Status status;
        uint256 rentedAt;
        uint256 returnedAt;
        uint256 disputeRaisedAt;
    }

    uint256 public itemCounter;
    mapping(uint256 => Item) public items;
    mapping(address => uint256) public activeRentals;

    // ── Arbitrator Pool ──
    address[] public arbitratorPool;
    mapping(address => bool) public isArbitrator;
    mapping(uint256 => address) public assignedArbitrator; // itemId => chosen arbitrator for that dispute

    event ItemListed(uint256 indexed itemId, address indexed owner, string ipfsCID);
    event ItemRented(uint256 indexed itemId, address indexed renter);
    event ItemReturned(uint256 indexed itemId, address indexed renter);
    event ReturnConfirmed(uint256 indexed itemId, uint256 refundAmount);
    event DisputeRaised(uint256 indexed itemId, address indexed raisedBy, address indexed chosenArbitrator);
    event DisputeResolved(uint256 indexed itemId, address indexed winner);
    event ArbitratorRegistered(address indexed arbitrator);
    event ArbitratorRemoved(address indexed arbitrator);

    constructor() Ownable(msg.sender) {
        // Auto-register deployer as fallback arbitrator so disputes always work
        isArbitrator[msg.sender] = true;
        arbitratorPool.push(msg.sender);
    }

    // ═══════════════════════════════════════════
    //              ARBITRATOR POOL
    // ═══════════════════════════════════════════

    /// @notice Anyone can register as an arbitrator
    function registerAsArbitrator() external {
        if (isArbitrator[msg.sender]) revert BookRental__AlreadyRegistered();

        isArbitrator[msg.sender] = true;
        arbitratorPool.push(msg.sender);

        emit ArbitratorRegistered(msg.sender);
    }

    /// @notice Arbitrator can remove themselves from the pool
    function unregisterAsArbitrator() external {
        if (!isArbitrator[msg.sender]) revert BookRental__NotRegistered();

        isArbitrator[msg.sender] = false;

        // Remove from array by swapping with last element
        for (uint256 i = 0; i < arbitratorPool.length; ++i) {
            if (arbitratorPool[i] == msg.sender) {
                arbitratorPool[i] = arbitratorPool[arbitratorPool.length - 1];
                arbitratorPool.pop();
                break;
            }
        }

        emit ArbitratorRemoved(msg.sender);
    }

    /// @notice Get the total number of registered arbitrators
    function getArbitratorCount() external view returns (uint256) {
        return arbitratorPool.length;
    }

    /// @notice Get all registered arbitrators
    function getArbitratorPool() external view returns (address[] memory) {
        return arbitratorPool;
    }

    /// @dev Pick a pseudo-random arbitrator from the pool, excluding owner and renter
    function _pickRandomArbitrator(address _owner, address _renter, uint256 _itemId) internal view returns (address) {
        uint256 poolSize = arbitratorPool.length;

        // Build a list of eligible arbitrators (exclude owner & renter)
        address[] memory eligible = new address[](poolSize);
        uint256 eligibleCount = 0;

        for (uint256 i = 0; i < poolSize; ++i) {
            address candidate = arbitratorPool[i];
            if (candidate != _owner && candidate != _renter) {
                eligible[eligibleCount] = candidate;
                ++eligibleCount;
            }
        }

        if (eligibleCount == 0) revert BookRental__NoEligibleArbitrators();

        // Pseudo-random selection using prevrandao + block data
        uint256 randomIndex = uint256(
            keccak256(abi.encodePacked(block.prevrandao, block.timestamp, _itemId, msg.sender))
        ) % eligibleCount;

        return eligible[randomIndex];
    }

    // ═══════════════════════════════════════════
    //              RENTAL LIFECYCLE
    // ═══════════════════════════════════════════

    /// @notice List an item
    /// @param _ipfsCID IPFS hash containing book metadata
    /// @param _pricePerDay Daily rental price in wei
    /// @param _depositAmount Security deposit in wei
    /// @return The ID of the newly listed item
    function listItem(string memory _ipfsCID, uint256 _pricePerDay, uint256 _depositAmount) external returns (uint256) {
        if (bytes(_ipfsCID).length == 0) revert BookRental__IPFSCIDRequired();
        if (_depositAmount < _pricePerDay) revert BookRental__DepositTooLow();
        
        ++itemCounter;
        items[itemCounter] = Item({
            itemId: itemCounter,
            owner: payable(msg.sender),
            renter: payable(address(0)),
            pricePerDay: _pricePerDay,
            depositAmount: _depositAmount,
            ipfsCID: _ipfsCID,
            status: Status.Available,
            rentedAt: 0,
            returnedAt: 0,
            disputeRaisedAt: 0
        });

        emit ItemListed(itemCounter, msg.sender, _ipfsCID);
        return itemCounter;
    }

    /// @notice Rent an item (renter must accept terms off-chain, enforced by _acceptedTerms flag)
    /// @param _itemId The ID of the item to rent
    /// @param _acceptedTerms Must be true — renter agrees to damage liability terms
    function rentItem(uint256 _itemId, bool _acceptedTerms) external payable nonReentrant {
        if (!_acceptedTerms) revert BookRental__TermsNotAccepted();

        Item storage item = items[_itemId];
        if (item.status != Status.Available) revert BookRental__InvalidStatus();
        if (msg.sender == item.owner) revert BookRental__CannotRentOwnItem();
        if (activeRentals[msg.sender] >= MAX_ACTIVE_RENTALS) revert BookRental__MaxRentalsReached();
        
        uint256 requiredPayment = item.depositAmount + item.pricePerDay;
        if (msg.value < requiredPayment) revert BookRental__InsufficientPayment();

        item.status = Status.Rented;
        item.renter = payable(msg.sender);
        item.rentedAt = block.timestamp;
        item.returnedAt = 0;
        item.disputeRaisedAt = 0;

        ++activeRentals[msg.sender];

        emit ItemRented(_itemId, msg.sender);
    }

    /// @notice Return item back to owner
    /// @param _itemId The ID of the item
    function returnItem(uint256 _itemId) external {
        Item storage item = items[_itemId];
        if (item.status != Status.Rented) revert BookRental__InvalidStatus();
        if (msg.sender != item.renter) revert BookRental__NotRenter();

        item.status = Status.AwaitingConfirm;
        item.returnedAt = block.timestamp;

        emit ItemReturned(_itemId, msg.sender);
    }

    /// @notice Owner confirms return and triggers refund
    /// @dev If rented > 7 days, extra days are charged at 2x the daily rate
    /// @param _itemId The ID of the item
    function confirmReturn(uint256 _itemId) external nonReentrant {
        Item storage item = items[_itemId];
        if (item.status != Status.AwaitingConfirm) revert BookRental__InvalidStatus();
        
        // Allow owner to confirm, or anyone (including renter) if 48h has passed since return
        if (msg.sender != item.owner && block.timestamp < item.returnedAt + 48 hours) {
            revert BookRental__NotItemOwner();
        }

        // Calculate rental cost with penalty for late returns
        uint256 timeRented = item.returnedAt - item.rentedAt;
        uint256 daysRented = timeRented / 1 days;
        if (timeRented % 1 days > 0) {
            daysRented++; // Charge for partial days
        }
        if (daysRented == 0) {
            daysRented = 1; // Minimum 1 day
        }

        // Calculate total cost: normal rate for first 7 days, 2x rate after that
        uint256 standardDays = daysRented <= 7 ? daysRented : 7;
        uint256 overdueDays = daysRented > 7 ? daysRented - 7 : 0;
        uint256 totalRentalCost = (standardDays * item.pricePerDay) + (overdueDays * item.pricePerDay * 2);
        
        // We already collected 1 day upfront, so subtract it
        uint256 additionalCost = totalRentalCost > item.pricePerDay ? totalRentalCost - item.pricePerDay : 0;
        
        uint256 refundAmount;
        uint256 ownerPayment;

        if (additionalCost >= item.depositAmount) {
            refundAmount = 0;
            ownerPayment = item.depositAmount + item.pricePerDay; // Owner gets full deposit + 1st day
        } else {
            refundAmount = item.depositAmount - additionalCost;
            ownerPayment = item.pricePerDay + additionalCost;
        }

        // Reset item and decrement active rentals
        item.status = Status.Available;
        address payable previousRenter = item.renter;
        item.renter = payable(address(0));

        --activeRentals[previousRenter];

        if (ownerPayment > 0) {
            item.owner.transfer(ownerPayment);
        }
        if (refundAmount > 0) {
            previousRenter.transfer(refundAmount);
        }

        emit ReturnConfirmed(_itemId, refundAmount);
    }

    /// @notice Owner or Renter can raise a dispute — a random arbitrator is assigned
    /// @param _itemId The ID of the item
    function raiseDispute(uint256 _itemId) external {
        Item storage item = items[_itemId];
        if (item.status != Status.AwaitingConfirm) revert BookRental__InvalidStatus();
        if (msg.sender != item.renter && msg.sender != item.owner) revert BookRental__Unauthorized();

        // Pick a random arbitrator (excluding owner & renter)
        address chosenArbitrator = _pickRandomArbitrator(item.owner, item.renter, _itemId);
        assignedArbitrator[_itemId] = chosenArbitrator;

        item.status = Status.InDispute;
        item.disputeRaisedAt = block.timestamp;

        emit DisputeRaised(_itemId, msg.sender, chosenArbitrator);
    }

    /// @notice Only the assigned arbitrator for this dispute can resolve it
    /// @param _itemId The ID of the item
    /// @param _winner The address receiving the funds
    function resolveDispute(uint256 _itemId, address payable _winner) external nonReentrant {
        if (msg.sender != assignedArbitrator[_itemId]) revert BookRental__NotArbitrator();

        Item storage item = items[_itemId];
        if (item.status != Status.InDispute) revert BookRental__InvalidStatus();

        uint256 totalPool = item.depositAmount + item.pricePerDay;

        // Decrement active rentals for the renter
        --activeRentals[item.renter];

        item.status = Status.Available;
        item.renter = payable(address(0));
        assignedArbitrator[_itemId] = address(0); // Clear assignment

        _winner.transfer(totalPool);

        emit DisputeResolved(_itemId, _winner);
    }

    /// @notice Get item details
    /// @param _itemId The ID of the item
    /// @return Item details
    function getItem(uint256 _itemId) external view returns (Item memory) {
        return items[_itemId];
    }
}
