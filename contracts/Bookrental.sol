// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Decentralized Book Rental Platform
/// @notice Allows users to list books and rent them with deposit protection
contract BookRental is ReentrancyGuard, Ownable {
    
    struct Book {
        uint256 bookId;
        string ipfsCID; // Metadata stored on IPFS
        address payable owner;
        uint256 dailyRentalPrice;
        uint256 depositAmount;
        bool isAvailable;
        address currentRenter;
    }
    
    struct Rental {
        uint256 rentalId;
        uint256 bookId;
        address renter;
        uint256 startTime;
        uint256 returnDeadline;
        uint256 depositPaid;
        bool isActive;
    }
    
    uint256 private bookCounter;
    uint256 private rentalCounter;
    uint256 public platformFeePercent = 5; // 5% platform fee
    
    mapping(uint256 => Book) public books;
    mapping(uint256 => Rental) public rentals;
    mapping(address => uint256[]) public userBooks;
    mapping(address => uint256[]) public userRentals;
    
    event BookListed(uint256 indexed bookId, address indexed owner, string ipfsCID);
    event BookRented(uint256 indexed rentalId, uint256 indexed bookId, address indexed renter);
    event BookReturned(uint256 indexed rentalId, uint256 indexed bookId, bool isLate);
    
    /// @notice List a new book for rental
    /// @param _ipfsCID IPFS hash containing book metadata
    /// @param _dailyRentalPrice Daily rental price in wei
    /// @param _depositAmount Security deposit in wei
    /// @return bookId The ID of the newly listed book
    function listBook(
        string memory _ipfsCID,
        uint256 _dailyRentalPrice,
        uint256 _depositAmount
    ) external returns (uint256) {
        require(bytes(_ipfsCID).length > 0, "IPFS CID required");
        require(_dailyRentalPrice > 0, "Price must be > 0");
        require(_depositAmount >= _dailyRentalPrice, "Deposit too low");
        
        bookCounter++;
        books[bookCounter] = Book({
            bookId: bookCounter,
            ipfsCID: _ipfsCID,
            owner: payable(msg.sender),
            dailyRentalPrice: _dailyRentalPrice,
            depositAmount: _depositAmount,
            isAvailable: true,
            currentRenter: address(0)
        });
        
        userBooks[msg.sender].push(bookCounter);
        emit BookListed(bookCounter, msg.sender, _ipfsCID);
        
        return bookCounter;
    }
    
    /// @notice Rent a book by paying deposit
    /// @param _bookId The ID of the book to rent
    /// @param _rentalDays Number of days to rent
    /// @return rentalId The ID of the rental agreement
    function rentBook(uint256 _bookId, uint256 _rentalDays) 
        external 
        payable 
        nonReentrant 
        returns (uint256) 
    {
        Book storage book = books[_bookId];
        require(book.isAvailable, "Book not available");
        require(_rentalDays > 0, "Invalid rental period");
        require(msg.sender != book.owner, "Cannot rent own book");
        
        uint256 totalCost = book.dailyRentalPrice * _rentalDays + book.depositAmount;
        require(msg.value >= totalCost, "Insufficient payment");
        
        book.isAvailable = false;
        book.currentRenter = msg.sender;
        
        rentalCounter++;
        rentals[rentalCounter] = Rental({
            rentalId: rentalCounter,
            bookId: _bookId,
            renter: msg.sender,
            startTime: block.timestamp,
            returnDeadline: block.timestamp + (_rentalDays * 1 days),
            depositPaid: book.depositAmount,
            isActive: true
        });
        
        userRentals[msg.sender].push(rentalCounter);
        
        // Pay rental fee to owner (minus platform fee)
        uint256 rentalFee = book.dailyRentalPrice * _rentalDays;
        uint256 platformCut = (rentalFee * platformFeePercent) / 100;
        uint256 ownerPayment = rentalFee - platformCut;
        
        book.owner.transfer(ownerPayment);
        
        emit BookRented(rentalCounter, _bookId, msg.sender);
        
        return rentalCounter;
    }
    
    /// @notice Return a rented book
    /// @param _rentalId The rental agreement ID
    function returnBook(uint256 _rentalId) external nonReentrant {
        Rental storage rental = rentals[_rentalId];
        require(rental.isActive, "Rental not active");
        require(msg.sender == rental.renter, "Not the renter");
        
        Book storage book = books[rental.bookId];
        
        bool isLate = block.timestamp > rental.returnDeadline;
        uint256 refundAmount = rental.depositPaid;
        
        if (isLate) {
            // Deduct late fee (1 day rental price per day late)
            uint256 daysLate = (block.timestamp - rental.returnDeadline) / 1 days + 1;
            uint256 lateFee = book.dailyRentalPrice * daysLate;
            
            if (lateFee >= refundAmount) {
                refundAmount = 0;
                book.owner.transfer(rental.depositPaid);
            } else {
                refundAmount -= lateFee;
                book.owner.transfer(lateFee);
                payable(rental.renter).transfer(refundAmount);
            }
        } else {
            payable(rental.renter).transfer(refundAmount);
        }
        
        rental.isActive = false;
        book.isAvailable = true;
        book.currentRenter = address(0);
        
        emit BookReturned(_rentalId, rental.bookId, isLate);
    }
    
    /// @notice Get all books listed by a user
    /// @param _user The user address
    /// @return Array of book IDs
    function getUserBooks(address _user) external view returns (uint256[] memory) {
        return userBooks[_user];
    }
}