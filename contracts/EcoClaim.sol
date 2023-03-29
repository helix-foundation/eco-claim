// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@helix-foundation/eco-id/contracts/EcoID.sol";
import "@helix-foundation/eco-id/contracts/interfaces/IECO.sol";

contract EcoClaim is EIP712("EcoClaim", "1") {
    /**
     * Use for validating merkel proof of claims for tokens
     */
    using MerkleProof for bytes32[];

    /**
     * Use for signarture recovery and verification on token claiming
     */
    using ECDSA for bytes32;

    /**
     * Use for tracking the nonces on signatures
     */
    using Counters for Counters.Counter;

    /**
     * Event for when the constructor has finished
     */
    event InitializeEcoClaim();

    /**
     * Event for when a claim is made
     */
    event Claim(string socialID, address indexed addr, uint256 eco);

    /**
     * Error for when the a signature has expired
     */
    error SignatureExpired();

    /**
     * Error for when the signature is invalid
     */
    error InvalidSignature();

    /**
     * Error for when a claim has not been verified in the EcoID by the trusted verifier
     */
    error UnverifiedClaim();

    /**
     * Error for when the submitted proof fails to be validated against the merkle root
     */
    error InvalidProof();

    /**
     * Error for when the submitted proof is not the same depth as the merkle tree
     */
    error InvalidProofDepth();

    /**
     * Error for when the fee amount is greater than the available eco balance
     */
    error InvalidFee();

    /**
     * Error for when the user tries to claim with no points in their balance
     */
    error InvalidPoints();

    /**
     * Error for when a user tries to claim tokens for a given social id, that have already been claimed
     */
    error TokensAlreadyClaimed();

    /**
     * Error for when the user tries to claim tokens after the claim period has ended
     */
    error ClaimPeriodEnded();

    /**
     * The hash of the register function signature for the recipient
     */
    bytes32 private constant CLAIM_TYPEHASH =
        keccak256(
            "Claim(string socialID,address recipient,uint256 feeAmount,uint256 deadline,uint256 nonce)"
        );

    /**
     * The merkel root for the data that maps social ids to their points distribution
     */
    bytes32 public _pointsMerkleRoot;

    /**
     * The depth of the merkel tree from root to leaf. We use this to verify the length of the
     * proofs submitted for verifiaction
     */
    uint256 public _proofDepth;

    /**
     * The mapping that stores the claim status for an account
     */
    mapping(string => bool) public _claimedBalances;

    /**
     * The mapping that store the current nonce for a social id
     */
    mapping(string => Counters.Counter) private _nonces;

    /**
     * The eco ERC20 contract
     */
    IECO public _eco;

    /**
     * The ecoX ERC20 contract
     */
    ERC20 public _ecoX;

    /**
     * The EcoID contract
     */
    EcoID public _ecoID;

    /**
     * The multiplier for points to eco conversion
     */
    uint256 public constant POINTS_MULTIPLIER = 1;

    /**
     * The trusted verifier for the socialIDs in the EcoID contract
     */
    address public _trustedVerifier;

    /**
     * The inflation multiplier for eco at deploy, used to calculate payouts
     */
    uint256 public _initialInflationMultiplier;

    /**
     * The duration of the claim period from the time the contract is deployed
     */
    uint256 public constant CLAIM_DURATION = 60 days;

    /**
     *  The end timestamp of the claim period
     */
    uint256 public _claimPeriodEnd;

    /**
     * Disable the implementation contract
     */
    constructor(
        IECO eco,
        ERC20 ecoX,
        EcoID ecoID,
        address trustedVerifier,
        bytes32 merkelRoot,
        uint256 proofDepth
    ) {
        _eco = eco;
        _ecoX = ecoX;
        _ecoID = ecoID;
        _trustedVerifier = trustedVerifier;
        _pointsMerkleRoot = merkelRoot;
        _proofDepth = proofDepth;
        _initialInflationMultiplier = _eco.getPastLinearInflation(block.number);
        _claimPeriodEnd = block.timestamp + CLAIM_DURATION;

        emit InitializeEcoClaim();
    }

    /**
     * Claims tokens that the caller is owned. The caller needs to present the merkel proof
     * for their token allocation. The leaf is generated as the hash of the socialID and
     * points, in that order.
     *
     * @param proof The merkel proof that the socialID and points are correct
     * @param socialID the socialID of the recipient
     * @param points the amount of points the user can claim, must be same as in the merkel tree and not an arbitrary amount
     */
    function claimTokens(
        bytes32[] memory proof,
        string calldata socialID,
        uint256 points
    ) external {
        _claimTokens(proof, socialID, points, msg.sender, 0);
    }

    /**
     * Claims tokens on behalf of a recipient. The recipient has agreed to let another account make the on-chain tx for them, and
     * has agreed to pay them a fee in eco for the service. The caller needs to present the merkel proof for their token allocation.
     * The leaf is generated as the hash of the socialID and points, in that order.
     *
     * @param proof The merkel proof that the socialID and points are correct
     * @param socialID the socialID of the recipient
     * @param points the amount of points the user can claim, must be same as in the merkel tree and not an arbitrary amount
     * @param recipient the recipient of the tokens
     * @param feeAmount the fee in eco the payer is granted from the recipient
     * @param deadline the time at which the signature is no longer valid
     * @param recipientSig the signature signed by the recipient
     */
    function claimTokensOnBehalf(
        bytes32[] memory proof,
        string calldata socialID,
        uint256 points,
        address recipient,
        uint256 feeAmount,
        uint256 deadline,
        bytes calldata recipientSig
    ) external {
        //the claim signature is being called within its valid period
        if (block.timestamp > deadline) {
            revert SignatureExpired();
        }

        //the signature is properly signed
        if (
            !_verifyClaimSigature(
                socialID,
                recipient,
                feeAmount,
                deadline,
                _useNonce(socialID),
                recipientSig
            )
        ) {
            revert InvalidSignature();
        }

        _claimTokens(proof, socialID, points, recipient, feeAmount);
    }

    /**
     * Makes the _domainSeparatorV4() function externally callable for signature generation
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * Claim the tokens. The caller needs to present the merkel proof for their token allocation.
     * The leaf is generated as the hash of the socialID and points, in that order.
     *
     * @param proof The merkel proof that the socialID and points are correct
     * @param socialID the socialID of the recipient
     * @param points the amount of points the user can claim, must be same as in the merkel tree and not an arbitrary amount
     * @param recipient the recipient of the tokens
     * @param feeAmount the fee in eco the payer is granted from the recipient
     */
    function _claimTokens(
        bytes32[] memory proof,
        string calldata socialID,
        uint256 points,
        address recipient,
        uint256 feeAmount
    ) internal {
        //Checks that the claim period has not ended
        if (block.timestamp > _claimPeriodEnd) {
            revert ClaimPeriodEnded();
        }

        //Checks that the social id has not claimed its tokens
        if (_claimedBalances[socialID]) {
            revert TokensAlreadyClaimed();
        }

        //require that the proof length is the same as the merkel tree depth
        if (proof.length != _proofDepth) {
            revert InvalidProofDepth();
        }

        //require that there are points to claim
        if (points == 0) {
            revert InvalidPoints();
        }

        //require that the fee is below the token amount
        if (feeAmount > points * POINTS_MULTIPLIER) {
            revert InvalidFee();
        }

        //eco tokens exist and have not been claimed yet
        if (!_ecoID.isClaimVerified(recipient, socialID, _trustedVerifier)) {
            revert UnverifiedClaim();
        }

        //verift merkle proof from input args
        bytes32 leaf = _getLeaf(socialID, points);
        if (!proof.verify(_pointsMerkleRoot, leaf)) {
            revert InvalidProof();
        }

        //set claimed for social id
        _claimedBalances[socialID] = true;

        //move the tokens
        _executeClaim(socialID, recipient, points, feeAmount);
    }

    /**
     * Performs the calculations and token transfers for a claim. It will send the eco tokens
     * to the recipient and any fee to the payer, also in eco, if there is one. The ecox will
     * also be calculated and transfered to the recipient
     *
     * @param socialID the socialID of the recipient
     * @param recipient the recipient of the tokens
     * @param points the amount of points the user can claim, must be same as in the merkel tree and not an arbitrary amount
     * @param feeAmount the fee in eco the payer is granted from the recipient
     */
    function _executeClaim(
        string calldata socialID,
        address recipient,
        uint256 points,
        uint256 feeAmount
    ) internal {
        uint256 ecoBalance = points * POINTS_MULTIPLIER;

        //the fee is below the token amount
        if (feeAmount > ecoBalance) {
            revert InvalidFee();
        }

        uint256 currentInflationMult = _eco.getPastLinearInflation(
            block.number
        );

        //transfer eco to recipient and payer
        if (feeAmount != 0) {
            //if there is a payer executing this tx, pay them out
            _eco.transfer(
                msg.sender,
                _applyInflationMultiplier(feeAmount, currentInflationMult)
            );
            _eco.transfer(
                recipient,
                _applyInflationMultiplier(
                    ecoBalance - feeAmount,
                    currentInflationMult
                )
            );
        } else {
            _eco.transfer(
                recipient,
                _applyInflationMultiplier(ecoBalance, currentInflationMult)
            );
        }

        //emit event for succesfull claim
        emit Claim(
            socialID,
            recipient,
            _applyInflationMultiplier(ecoBalance, currentInflationMult)
        );
    }

    /**
     * Verifies that the recipient signed the message, and that the message is the correct hash of the
     * parameters for determining the payer pay off and the length the signature is valid.
     *
     * @param socialID the socialID of the recipient
     * @param recipient the recipient of the tokens
     * @param feeAmount the fee in eco the payer is granted from the recipient
     * @param deadline the time at which the signature is no longer valid
     * @param nonce the nonce for the signatures for this claim registration
     * @param recipientSig the signature signed by the recipient
     *
     * @return true if the signature is valid, false otherwise
     */
    function _verifyClaimSigature(
        string calldata socialID,
        address recipient,
        uint256 feeAmount,
        uint256 deadline,
        uint256 nonce,
        bytes calldata recipientSig
    ) internal view returns (bool) {
        bytes32 hash = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    CLAIM_TYPEHASH,
                    keccak256(bytes(socialID)),
                    recipient,
                    feeAmount,
                    deadline,
                    nonce
                )
            )
        );
        return hash.recover(recipientSig) == recipient;
    }

    /**
     * Returns the current nonce for a given socialID
     *
     * @param socialID the socialID to get and increment the nonce for
     *
     * @return the nonce
     */
    function nonces(string calldata socialID) public view returns (uint256) {
        return _nonces[socialID].current();
    }

    /**
     * Returns the merkle tree leaf hash for the given data
     */
    function _getLeaf(string calldata socialID, uint256 points)
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(socialID, points));
    }

    /**
     * Applies the inflation multiplier for eco balances before transfers
     */
    function _applyInflationMultiplier(
        uint256 value,
        uint256 currentInflationMultiplier
    ) internal view returns (uint256) {
        return
            (_initialInflationMultiplier * value) / currentInflationMultiplier;
    }

    /**
     * Returns the current nonce for a claim and automatically increament it
     *
     * @param socialID the socialID to get and increment the nonce for
     *
     * @return current current nonce before incrementing
     */
    function _useNonce(string calldata socialID)
        internal
        returns (uint256 current)
    {
        Counters.Counter storage nonce = _nonces[socialID];
        current = nonce.current();
        nonce.increment();
    }
}
