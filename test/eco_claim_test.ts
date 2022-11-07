import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers } from "hardhat"
import { EcoClaim, EcoID, EcoTest, EcoXTest } from "../typechain-types"
import {
  signClaimTypeMessage,
  signRegistrationTypeMessage,
  signReleaseTypeMessage,
} from "./utils/sign"
import { MerkleTree } from "merkletreejs"
import keccak256 from "keccak256"
import { claimElements, deployEcoClaim, nextPowerOf2 } from "./utils/fixtures"
import { BigNumber } from "ethers"
import { increase, latestBlockTimestamp } from "./utils/time"
import { ClaimElement, MerkelLeaves } from "./utils/types"

describe("EcoClaim tests", async function () {
  let owner: SignerWithAddress,
    addr0: SignerWithAddress,
    addr1: SignerWithAddress
  let eco: EcoTest
  let ecoX: EcoXTest
  let ecoID: EcoID
  let claim: EcoClaim
  let leaves: MerkelLeaves
  let tree: MerkleTree
  let ecoXRatio: number
  let claimLength: BigNumber, vestingPeriod: BigNumber
  const feeAmount = 20
  const LAST_VESTING_MONTH = 24
  let deadline: number, chainID: number, nonce: number

  describe("On claim", async function () {
    beforeEach(async function () {
      ;[owner, addr0, addr1] = await ethers.getSigners()
      ;[eco, ecoX, ecoID, claim, leaves, tree] = await deployEcoClaim(
        owner,
        claimElements
      )
      ecoXRatio = (await claim.POINTS_TO_ECOX_RATIO()).toNumber()
      claimLength = await claim.CLAIMABLE_PERIOD()
      vestingPeriod = await claim.VESTING_PERIOD()

      deadline = parseInt(await latestBlockTimestamp(), 16) + 10000
      chainID = (await ethers.provider.getNetwork()).chainId
      nonce = (await claim.nonces(addr0.address)).toNumber()
    })

    describe("when EcoID registration does not exists", async () => {
      it("should fail when the claim has not been verified on the register", async function () {
        const proof = tree.getHexProof(leaves[0])
        const element = claimElements[0]
        await expect(
          claim.claimTokens(proof, element.id, element.points)
        ).to.be.revertedWith("UnverifiedClaim()")
      })
    })

    describe("when EcoID registration exists", async () => {
      let element: ClaimElement
      let socialID: string
      let proof: string[]
      let time: number
      let points: number, ecoBalance: number, ecoXBalance: number

      beforeEach(async function () {
        // create claim for main element we test on
        element = claimElements[0]
        socialID = element.id
        points = element.points as number
        ecoBalance = points * (await claim.POINTS_MULTIPLIER()).toNumber()
        ecoXBalance = points / ecoXRatio

        await mintNft(element, addr0)
        proof = tree.getHexProof(leaves[0])
      })
      describe("when claiming as caller", async () => {
        it("should fail when leaf verification fails because leaf is incorrect", async function () {
          // create claim for second element
          await mintNft(claimElements[1], addr0)

          const proof = tree.getHexProof(leaves[0])
          await expect(
            claim
              .connect(addr0)
              .claimTokens(proof, claimElements[1].id, claimElements[1].points)
          ).to.be.revertedWith("InvalidProof()")
        })

        it("should fail when leaf verification fails because original inputs are invalid", async function () {
          // calculate the leaves.
          const leavesWrong = claimElements.map((x) =>
            ethers.utils.solidityKeccak256(
              ["uint256", "string"],
              [x.points, x.id] // Reverse hash order of claim elements than what the original merkle tree has
            )
          )
          // calculate the tree and its root
          const reverseTree = new MerkleTree(leavesWrong, keccak256, {
            sortPairs: true,
          })
          const proof = reverseTree.getHexProof(leavesWrong[0])

          await expect(
            claim.connect(addr0).claimTokens(proof, socialID, points)
          ).to.be.revertedWith("InvalidProof()")
        })

        it("should fail when leaf verification fails because proof lenght is not equal to the tree depth", async function () {
          const proof = tree.getHexProof(leaves[0])
          const shortProof = proof.slice(0, proof.length - 2)
          await expect(
            claim.connect(addr0).claimTokens(shortProof, socialID, points)
          ).to.be.revertedWith("InvalidProofDepth()")
        })

        it("should fail when there is no balance to transfer", async function () {
          const proof = tree.getHexProof(leaves[0])
          await expect(
            claim.connect(addr0).claimTokens(proof, socialID, points)
          ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
        })

        it("should fail when the claim period has passed", async function () {
          await increase(claimLength.toNumber())
          const proof = tree.getHexProof(leaves[0])
          await expect(
            claim.connect(addr0).claimTokens(proof, socialID, points)
          ).to.be.revertedWith("ClaimDeadlineExpired(")
        })

        it("should fail when we claim zero points", async function () {
          const proof = tree.getHexProof(leaves[0])
          await expect(
            claim.connect(addr0).claimTokens(proof, socialID, 0)
          ).to.be.revertedWith("InvalidPoints()")
        })

        describe("when claims contract has a balance", async () => {
          beforeEach(async function () {
            await eco.transfer(claim.address, 2000)
            await ecoX.transfer(claim.address, 1000)
          })

          it("should succeed when the proof and leaf match and emit an event", async function () {
            const proof = tree.getHexProof(leaves[0])

            await expect(
              claim.connect(addr0).claimTokens(proof, socialID, points)
            )
              .to.emit(claim, "Claim")
              .withArgs(socialID, addr0.address, ecoBalance, ecoXBalance)

            // check balances
            expect(await eco.balanceOf(addr0.address)).to.equal(ecoBalance)
            expect(await ecoX.balanceOf(addr0.address)).to.equal(ecoXBalance)
          })

          it("should find the next power of 2", async function () {
            expect(nextPowerOf2(-1)).to.eq(2)
            expect(nextPowerOf2(0)).to.eq(2)
            expect(nextPowerOf2(1)).to.eq(2)
            expect(nextPowerOf2(7)).to.eq(8)
            expect(nextPowerOf2(9)).to.eq(16)
            expect(nextPowerOf2(16)).to.eq(16)
          })

          it("should have the same proof length for all leaves and equal the tree depth", async function () {
            const treeDepth = tree.getDepth()
            leaves.forEach((leaf) => {
              expect(tree.getHexProof(leaf).length).to.eq(treeDepth)
            })
          })

          it("should fail when tokens claimed", async function () {
            const proof = tree.getHexProof(leaves[0])

            await expect(
              claim.connect(addr0).claimTokens(proof, socialID, points)
            )
              .to.emit(claim, "Claim")
              .withArgs(socialID, addr0.address, ecoBalance, ecoXBalance)

            // should revert on seconds attempt to claim tokens
            await expect(
              claim.connect(addr0).claimTokens(proof, socialID, points)
            ).to.be.revertedWith("TokensAlreadyClaimed()")
          })

          it("should succeed to pay out when there is inflation", async function () {
            await eco.updateInflation(50)

            const proof = tree.getHexProof(leaves[0])

            await expect(
              claim.connect(addr0).claimTokens(proof, socialID, points)
            )
              .to.emit(claim, "Claim")
              .withArgs(socialID, addr0.address, ecoBalance * 2, ecoXBalance)

            // check balances
            expect(await eco.balanceOf(addr0.address)).to.equal(ecoBalance * 2)
            expect(await ecoX.balanceOf(addr0.address)).to.equal(ecoXBalance)
          })
        })
      })

      describe("when claiming on behalf of", async () => {
        beforeEach(async function () {
          await eco.transfer(claim.address, 1000)
          await ecoX.transfer(claim.address, 1000)
        })

        it("should fail when signature has expired", async function () {
          const signature = await signClaimTypeMessage(
            socialID,
            addr0,
            feeAmount,
            deadline,
            nonce,
            chainID,
            claim.address
          )

          // increment time past expiration
          await increase(deadline * 10)

          // should revert on expired
          await expect(
            claim
              .connect(addr0)
              .claimTokensOnBehalf(
                proof,
                socialID,
                points,
                addr0.address,
                feeAmount,
                deadline,
                signature
              )
          ).to.be.revertedWith("SignatureExpired()")
        })

        it("should fail when nonce is invalid", async function () {
          const signature = await signClaimTypeMessage(
            socialID,
            addr0,
            feeAmount,
            deadline,
            nonce + 1,
            chainID,
            claim.address
          )

          // increment time past expiration
          await increase(deadline * 10)

          // should revert on expired
          await expect(
            claim
              .connect(addr0)
              .claimTokensOnBehalf(
                proof,
                socialID,
                points,
                addr0.address,
                feeAmount,
                deadline,
                signature
              )
          ).to.be.revertedWith("SignatureExpired()")
        })

        it("should fail on invalid signature", async function () {
          const signature = await signClaimTypeMessage(
            socialID,
            addr0,
            feeAmount * 2,
            deadline,
            nonce,
            chainID,
            claim.address
          )

          // should revert on invalid
          await expect(
            claim
              .connect(addr0)
              .claimTokensOnBehalf(
                proof,
                socialID,
                points,
                addr0.address,
                feeAmount,
                deadline,
                signature
              )
          ).to.be.revertedWith("InvalidSignature()")

          const signature1 = await signClaimTypeMessage(
            socialID,
            addr0,
            feeAmount,
            deadline,
            nonce,
            chainID,
            claim.address
          )

          // should revert on invalid
          await expect(
            claim
              .connect(owner)
              .claimTokensOnBehalf(
                proof,
                socialID,
                points,
                owner.address,
                feeAmount,
                deadline,
                signature1
              )
          ).to.be.revertedWith("InvalidSignature()")
        })

        it("should fail when the fee is greater than the amount the user has in eco", async function () {
          const fee = ecoBalance * 2
          const signature = await signClaimTypeMessage(
            socialID,
            addr0,
            fee,
            deadline,
            nonce,
            chainID,
            claim.address
          )

          // should revert on invalid
          await expect(
            claim
              .connect(addr0)
              .claimTokensOnBehalf(
                proof,
                socialID,
                points,
                addr0.address,
                fee,
                deadline,
                signature
              )
          ).to.be.revertedWith("InvalidFee()")
        })

        it("should fail when substituting a release signature for a claim signature", async function () {
          const fee = ecoBalance * 2
          const signature = await signReleaseTypeMessage(
            socialID,
            addr0,
            fee,
            deadline,
            nonce,
            chainID,
            claim.address
          )

          // should revert on invalid
          await expect(
            claim
              .connect(addr0)
              .claimTokensOnBehalf(
                proof,
                socialID,
                points,
                addr0.address,
                fee,
                deadline,
                signature
              )
          ).to.be.revertedWith("InvalidSignature()")
        })

        it("should succeed and pay fee to caller when claiming on behalf of", async function () {
          const signature = await signClaimTypeMessage(
            socialID,
            addr0,
            feeAmount,
            deadline,
            nonce,
            chainID,
            claim.address
          )

          await expect(
            claim
              .connect(addr1)
              .claimTokensOnBehalf(
                proof,
                socialID,
                points,
                addr0.address,
                feeAmount,
                deadline,
                signature
              )
          )
            .to.emit(claim, "Claim")
            .withArgs(socialID, addr0.address, ecoBalance, ecoXBalance)

          // check balances
          expect(await eco.balanceOf(addr0.address)).to.equal(
            ecoBalance - feeAmount
          )
          expect(await eco.balanceOf(addr1.address)).to.equal(feeAmount)
          expect(await ecoX.balanceOf(addr0.address)).to.equal(ecoXBalance)
          expect(await ecoX.balanceOf(addr1.address)).to.equal(0)

          // check vested
          expect(await (await claim._claimBalances(socialID)).points).to.equal(
            points
          )
        })
      })

      describe("when releasing", async () => {
        let recipientPointsBalance: number, recipientStartingEcoXBalance: number
        let recipient: SignerWithAddress
        let firstNonce: number
        beforeEach(async function () {
          recipient = addr0
          recipientPointsBalance = points
          recipientStartingEcoXBalance = ecoXBalance

          await eco.transfer(claim.address, 4800)
          await ecoX.transfer(claim.address, 1200)

          const signature = await signClaimTypeMessage(
            socialID,
            recipient,
            feeAmount,
            deadline,
            nonce,
            chainID,
            claim.address
          )

          await expect(
            claim
              .connect(recipient)
              .claimTokensOnBehalf(
                proof,
                socialID,
                points,
                recipient.address,
                feeAmount,
                deadline,
                signature
              )
          )
            .to.emit(claim, "Claim")
            .withArgs(socialID, recipient.address, ecoBalance, ecoXBalance)

          // check nonce incremented
          firstNonce = (await claim.nonces(socialID)).toNumber()
          expect(firstNonce).to.eq(nonce + 1)

          // check vesting
          expect(await (await claim._claimBalances(socialID)).points).to.equal(
            points
          )
          expect(await ecoX.balanceOf(recipient.address)).to.equal(ecoXBalance)
        })

        describe("when calling release tokens as recipient", async () => {
          it("should fail when the release cliff has not happened yet", async function () {
            await expect(
              claim.connect(recipient).releaseTokens(socialID)
            ).to.be.revertedWith("CliffNotMet()")
          })

          it("should fail when invalid caller tries to release tokens", async function () {
            await increase(vestingPeriod.toNumber())
            await expect(
              claim.connect(owner).releaseTokens(socialID)
            ).to.be.revertedWith("InvalidReleaseCaller()")
          })

          for (let i = 1; i < 25; i++) {
            it(`should succeed in transfering tokens to caller after cliff + ${i} months have passed`, async function () {
              const vestingBalance =
                recipientPointsBalance * (await getVestingMultiplier(i))

              await increase(vestingPeriod.toNumber() * i)
              await expect(claim.connect(recipient).releaseTokens(socialID))
                .to.emit(claim, "ReleaseVesting")
                .withArgs(
                  recipient.address,
                  recipient.address,
                  ecoBalance,
                  vestingBalance,
                  0
                )

              // check original balance cleared
              expect(
                await (
                  await claim._claimBalances(socialID)
                ).points
              ).to.equal(0)
              // check balance
              expect(await eco.balanceOf(recipient.address)).to.equal(
                ecoBalance * 2
              )
              expect(await ecoX.balanceOf(recipient.address)).to.equal(
                vestingBalance + recipientStartingEcoXBalance
              )
            })
          }

          it("should not increase payout past the last vesting period", async function () {
            // should be max vesting reward after 24 months
            const vestingBalance =
              recipientPointsBalance *
              (await getVestingMultiplier(LAST_VESTING_MONTH))
            // set time really far into future
            await increase(vestingPeriod.toNumber() * LAST_VESTING_MONTH * 10)
            await expect(claim.connect(recipient).releaseTokens(socialID))
              .to.emit(claim, "ReleaseVesting")
              .withArgs(
                recipient.address,
                recipient.address,
                ecoBalance,
                vestingBalance,
                0
              )

            // check original balance cleared
            expect(
              await (
                await claim._claimBalances(socialID)
              ).points
            ).to.equal(0)
            // check balance
            expect(await eco.balanceOf(recipient.address)).to.equal(
              ecoBalance * 2
            )
            expect(await ecoX.balanceOf(recipient.address)).to.equal(
              vestingBalance + recipientStartingEcoXBalance
            )
          })

          it("should only allow a single release", async function () {
            const vestingBalance =
              recipientPointsBalance *
              (await getVestingMultiplier(LAST_VESTING_MONTH))
            await increase(vestingPeriod.toNumber() * LAST_VESTING_MONTH)
            await expect(claim.connect(recipient).releaseTokens(socialID))
              .to.emit(claim, "ReleaseVesting")
              .withArgs(
                recipient.address,
                recipient.address,
                ecoBalance,
                vestingBalance,
                0
              )

            // check original balance cleared
            expect(
              await (
                await claim._claimBalances(socialID)
              ).points
            ).to.equal(0)
            // check balance
            expect(await eco.balanceOf(recipient.address)).to.equal(
              ecoBalance * 2
            )
            expect(await ecoX.balanceOf(recipient.address)).to.equal(
              vestingBalance + recipientStartingEcoXBalance
            )

            // try releasing a second time
            await expect(
              claim.connect(recipient).releaseTokens(socialID)
            ).to.be.revertedWith("EmptyVestingBalance()")
            // check balance
            expect(await eco.balanceOf(recipient.address)).to.equal(
              ecoBalance * 2
            )
            expect(await ecoX.balanceOf(recipient.address)).to.equal(
              vestingBalance + recipientStartingEcoXBalance
            )
          })

          it("should release when there is inflation", async function () {
            await eco.updateInflation(25)

            const vestingBalance =
              recipientPointsBalance *
              (await getVestingMultiplier(LAST_VESTING_MONTH))
            await increase(vestingPeriod.toNumber() * LAST_VESTING_MONTH)
            await expect(claim.connect(recipient).releaseTokens(socialID))
              .to.emit(claim, "ReleaseVesting")
              .withArgs(
                recipient.address,
                recipient.address,
                ecoBalance * 4,
                vestingBalance,
                0
              )

            // check original balance cleared
            expect(
              await (
                await claim._claimBalances(socialID)
              ).points
            ).to.equal(0)
            // check balance
            expect(await eco.balanceOf(recipient.address)).to.equal(
              ecoBalance + ecoBalance * 4
            )
            expect(await ecoX.balanceOf(recipient.address)).to.equal(
              vestingBalance + recipientStartingEcoXBalance
            )
          })
        })

        describe("when calling releasing on behalf of", async () => {
          beforeEach(async function () {})

          it("should fail when signature has expired", async function () {
            const signature = await signReleaseTypeMessage(
              socialID,
              recipient,
              feeAmount,
              deadline,
              firstNonce,
              chainID,
              claim.address
            )

            // increment time past expiration
            await increase(deadline * 2)

            await expect(
              claim.releaseTokensOnBehalf(
                socialID,
                recipient.address,
                feeAmount,
                deadline,
                signature
              )
            ).to.be.revertedWith("SignatureExpired()")
          })

          it("should fail when nonce is invalid", async function () {
            const signature = await signReleaseTypeMessage(
              socialID,
              recipient,
              feeAmount,
              deadline,
              firstNonce + 1,
              chainID,
              claim.address
            )

            // increment time past expiration
            await increase(deadline * 2)

            await expect(
              claim.releaseTokensOnBehalf(
                socialID,
                recipient.address,
                feeAmount,
                deadline,
                signature
              )
            ).to.be.revertedWith("SignatureExpired()")
          })

          it("should fail on invalid signature", async function () {
            const signature = await signReleaseTypeMessage(
              socialID,
              recipient,
              feeAmount,
              deadline,
              firstNonce,
              chainID,
              claim.address
            )
            await expect(
              claim.releaseTokensOnBehalf(
                socialID,
                recipient.address,
                feeAmount * 10,
                deadline,
                signature
              )
            ).to.be.revertedWith("InvalidSignature()")
          })

          it("should fail when the fee is greater than the amount the user has in eco", async function () {
            const fee = ecoBalance * 2
            // increase time
            await increase(vestingPeriod.toNumber())
            time = parseInt(await latestBlockTimestamp(), 16)
            deadline = time + 1000
            const signature = await signReleaseTypeMessage(
              socialID,
              recipient,
              fee,
              deadline,
              firstNonce,
              chainID,
              claim.address
            )
            await expect(
              claim.releaseTokensOnBehalf(
                socialID,
                recipient.address,
                fee,
                deadline,
                signature
              )
            ).to.be.revertedWith("InvalidFee()")
          })

          it("should fail when substituting a claim signature for a release signature", async function () {
            const fee = ecoBalance * 2
            // increase time
            await increase(vestingPeriod.toNumber())
            time = parseInt(await latestBlockTimestamp(), 16)
            deadline = time + 1000
            const signature = await signClaimTypeMessage(
              socialID,
              recipient,
              fee,
              deadline,
              firstNonce,
              chainID,
              claim.address
            )
            await expect(
              claim.releaseTokensOnBehalf(
                socialID,
                recipient.address,
                fee,
                deadline,
                signature
              )
            ).to.be.revertedWith("InvalidSignature()")
          })

          it("should succeed and pay fee to caller", async function () {
            const fee = recipientPointsBalance
            // should be increased due to vesting reward after 4 years
            const vestedRecipientBalance =
              recipientPointsBalance *
              (await getVestingMultiplier(LAST_VESTING_MONTH))
            // increase time
            await increase(vestingPeriod.toNumber() * LAST_VESTING_MONTH)
            time = parseInt(await latestBlockTimestamp(), 16)
            deadline = time + 1000
            const signature = await signReleaseTypeMessage(
              socialID,
              recipient,
              fee,
              deadline,
              firstNonce,
              chainID,
              claim.address
            )
            await expect(
              claim
                .connect(addr1)
                .releaseTokensOnBehalf(
                  socialID,
                  recipient.address,
                  fee,
                  deadline,
                  signature
                )
            )
              .to.emit(claim, "ReleaseVesting")
              .withArgs(
                recipient.address,
                addr1.address,
                ecoBalance - fee,
                vestedRecipientBalance,
                fee
              )

            // check original balance cleared
            expect(
              await (
                await claim._claimBalances(socialID)
              ).points
            ).to.equal(0)
            // check balance
            expect(await ecoX.balanceOf(recipient.address)).to.equal(
              recipientStartingEcoXBalance + vestedRecipientBalance
            )
            expect(await ecoX.balanceOf(addr1.address)).to.equal(0)
            expect(await eco.balanceOf(addr1.address)).to.equal(fee)
          })

          it("should fail to call release on behalf of more than once", async function () {
            const fee = recipientPointsBalance
            // should be increased due to vesting reward after 4 years
            const vestedRecipientBalance =
              recipientPointsBalance *
              (await getVestingMultiplier(LAST_VESTING_MONTH))
            // increase time
            await increase(vestingPeriod.toNumber() * LAST_VESTING_MONTH)
            time = parseInt(await latestBlockTimestamp(), 16)
            deadline = time + 1000
            let signature = await signReleaseTypeMessage(
              socialID,
              recipient,
              fee,
              deadline,
              firstNonce,
              chainID,
              claim.address
            )
            await expect(
              claim
                .connect(addr1)
                .releaseTokensOnBehalf(
                  socialID,
                  recipient.address,
                  fee,
                  deadline,
                  signature
                )
            )
              .to.emit(claim, "ReleaseVesting")
              .withArgs(
                recipient.address,
                addr1.address,
                ecoBalance - fee,
                vestedRecipientBalance,
                fee
              )

            // check original balance cleared
            expect(
              await (
                await claim._claimBalances(socialID)
              ).points
            ).to.equal(0)

            // check balance
            expect(await ecoX.balanceOf(recipient.address)).to.equal(
              recipientStartingEcoXBalance + vestedRecipientBalance
            )
            expect(await ecoX.balanceOf(addr1.address)).to.equal(0)
            expect(await eco.balanceOf(addr1.address)).to.equal(fee)

            // check nonce incremented
            const secondNonce = (await claim.nonces(socialID)).toNumber()
            expect(secondNonce).to.eq(firstNonce + 1)

            signature = await signReleaseTypeMessage(
              socialID,
              recipient,
              fee,
              deadline,
              secondNonce,
              chainID,
              claim.address
            )
            await expect(
              claim
                .connect(addr1)
                .releaseTokensOnBehalf(
                  socialID,
                  recipient.address,
                  fee,
                  deadline,
                  signature
                )
            ).to.be.revertedWith("EmptyVestingBalance()")

            // check balance
            expect(await ecoX.balanceOf(recipient.address)).to.equal(
              recipientStartingEcoXBalance + vestedRecipientBalance
            )
            expect(await ecoX.balanceOf(addr1.address)).to.equal(0)
            expect(await eco.balanceOf(addr1.address)).to.equal(fee)
          })
        })
      })
    })
  })

  /**
   * Gets the multiplier for the vesting year
   */
  async function getVestingMultiplier(year: number): Promise<number> {
    return (
      (await claim._vestedMultiples(year - 1)).toNumber() /
      (await claim.VESTING_DIVIDER()).toNumber()
    )
  }
  /**
   * Mints an nft for the claims element so that we can test
   */
  async function mintNft(element: ClaimElement, recipient: SignerWithAddress) {
    await mintNftForUser(element, recipient, ecoID, owner)
  }
})

/**
 * Mints an nft for the claims element so that we can test
 */
export async function mintNftForUser(
  element: ClaimElement,
  recipient: SignerWithAddress,
  ecoID: EcoID,
  owner: SignerWithAddress
) {
  const { id: claim } = element
  const deadline = parseInt(await latestBlockTimestamp(), 16) + 10000
  const chainID = (await ethers.provider.getNetwork()).chainId
  const nonce = (await ecoID.nonces(claim)).toNumber()
  const revocable = true
  const feeAmount = 0
  const [approvSig, verifySig] = await signRegistrationTypeMessage(
    claim,
    feeAmount,
    revocable,
    recipient,
    owner,
    deadline,
    nonce,
    chainID,
    ecoID.address
  )

  await expect(
    ecoID.register(
      claim,
      feeAmount,
      revocable,
      recipient.address,
      owner.address,
      deadline,
      approvSig,
      verifySig
    )
  )
    .to.emit(ecoID, "RegisterClaim")
    .withArgs(claim, feeAmount, revocable, recipient.address, owner.address)

  await ecoID.mintNFT(recipient.address, claim)
}
