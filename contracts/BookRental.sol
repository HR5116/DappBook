// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Decentralized Book Rental Platform
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

    enum Status { Available, Rented, AwaitingConfirm, InDispute, Closed }

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

    uint256 private itemCounter;
    address public arbitrator;
    mapping(uint256 => Item) public items;

    event ItemListed(uint256 indexed itemId, address indexed owner, string ipfsCID);
    event ItemRented(uint256 indexed itemId, address indexed renter);
    event ItemReturned(uint256 indexed itemId, address indexed renter);
    event ReturnConfirmed(uint256 indexed itemId, uint256 refundAmount);
    event DisputeRaised(uint256 indexed itemId, address indexed renter);
    event DisputeResolved(uint256 indexed itemId, address indexed winner);

    modifier onlyArbitrator() {
        if (msg.sender != arbitrator) revert BookRental__NotArbitrator();
        _;
    }

    constructor(address _arbitrator) Ownable(msg.sender) {
        arbitrator = _arbitrator;
    }

    /// @notice List an item
    /// @param _ipfsCID IPFS hash containing book metadata
    /// @param _pricePerDay Daily rental price in wei
    /// @param _depositAmount Security deposit in wei
    /// @return The ID of the newly listed item
    function listItem(string memory _ipfsCID, uint256 _pricePerDay, uint256 _depositAmount) external onlyOwner returns (uint256) {
        if (bytes(_ipfsCID).length == 0) revert BookRental__IPFSCIDRequired();
        if (_pricePerDay == 0) revert BookRental__InvalidPrice();
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

    /// @notice Rent an item
    /// @param _itemId The ID of the item to rent
    function rentItem(uint256 _itemId) external payable nonReentrant {
        Item storage item = items[_itemId];
        if (item.status != Status.Available) revert BookRental__InvalidStatus();
        if (msg.sender == item.owner) revert BookRental__CannotRentOwnItem();
        
        uint256 requiredPayment = item.depositAmount + item.pricePerDay;
        if (msg.value < requiredPayment) revert BookRental__InsufficientPayment();

        item.status = Status.Rented;
        item.renter = payable(msg.sender);
        item.rentedAt = block.timestamp;
        item.returnedAt = 0;
        item.disputeRaisedAt = 0;

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
    /// @param _itemId The ID of the item
    function confirmReturn(uint256 _itemId) external nonReentrant {
        Item storage item = items[_itemId];
        if (item.status != Status.AwaitingConfirm) revert BookRental__InvalidStatus();
        
        // Allow owner to confirm, or anyone (including renter) if 48h has passed since return
        if (msg.sender != item.owner && block.timestamp < item.returnedAt + 48 hours) {
            revert BookRental__NotItemOwner();
        }

        // Calculate rental cost
        uint256 timeRented = item.returnedAt - item.rentedAt;
        uint256 daysRented = timeRented / 1 days;
        if (timeRented % 1 days > 0) {
            daysRented++; // Charge for partial days
        }
        if (daysRented == 0) {
            daysRented = 1; // Minimum 1 day
        }
        
        // We already collected 1 day upfront
        uint256 additionalDays = daysRented > 1 ? daysRented - 1 : 0;
        uint256 additionalCost = additionalDays * item.pricePerDay;
        
        uint256 refundAmount;
        uint256 ownerPayment;

        if (additionalCost >= item.depositAmount) {
            refundAmount = 0;
            ownerPayment = item.depositAmount + item.pricePerDay; // Owner gets full deposit + 1st day
        } else {
            refundAmount = item.depositAmount - additionalCost;
            ownerPayment = item.pricePerDay + additionalCost;
        }

        // Set status to closed temporarily if strictly required, then available.
        item.status = Status.Available;
        address payable previousRenter = item.renter;
        item.renter = payable(address(0));

        item.owner.transfer(ownerPayment);
        previousRenter.transfer(refundAmount);

        emit ReturnConfirmed(_itemId, refundAmount);
    }

    /// @notice Owner or Renter can raise a dispute
    /// @param _itemId The ID of the item
    function raiseDispute(uint256 _itemId) external {
        Item storage item = items[_itemId];
        if (item.status != Status.AwaitingConfirm) revert BookRental__InvalidStatus();
        if (msg.sender != item.renter && msg.sender != item.owner) revert BookRental__Unauthorized();

        item.status = Status.InDispute;
        item.disputeRaisedAt = block.timestamp;

        emit DisputeRaised(_itemId, msg.sender);
    }

    /// @notice Arbitrator resolves dispute
    /// @param _itemId The ID of the item
    /// @param _winner The address receiving the funds
    function resolveDispute(uint256 _itemId, address payable _winner) external onlyArbitrator nonReentrant {
        Item storage item = items[_itemId];
        if (item.status != Status.InDispute) revert BookRental__InvalidStatus();

        uint256 totalPool = item.depositAmount + item.pricePerDay;

        item.status = Status.Available;
        item.renter = payable(address(0));

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
