import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers } from "hardhat"
import { EcoClaim, EcoID, EcoTest } from "../typechain-types"
import { signClaimTypeMessage, signRegistrationTypeMessage } from "./utils/sign"
import { MerkleTree } from "merkletreejs"
import keccak256 from "keccak256"
import { claimElements, deployEcoClaim, nextPowerOf2 } from "./utils/fixtures"
import { increase, latestBlockTimestamp } from "./utils/time"
import { ClaimElement, MerkelLeaves } from "../scripts/utils/types"

describe("EcoClaim tests", async function () {
  let owner: SignerWithAddress,
    addr0: SignerWithAddress,
    addr1: SignerWithAddress
  let eco: EcoTest
  let ecoID: EcoID
  let claim: EcoClaim
  let leaves: MerkelLeaves
  let tree: MerkleTree
  const feeAmount = 20
  let deadline: number, chainID: number, nonce: number
  const claimDuration = 60 * 24 * 60 * 60 // 60 days

  describe("On claim", async function () {
    beforeEach(async function () {
      ;[owner, addr0, addr1] = await ethers.getSigners()
      ;[eco, ecoID, claim, leaves, tree] = await deployEcoClaim(
        owner,
        claimElements
      )

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
      let points: number, ecoBalance: number

      beforeEach(async function () {
        // create claim for main element we test on
        element = claimElements[0]
        socialID = element.id
        points = element.points as number
        ecoBalance = points * (await claim.POINTS_MULTIPLIER()).toNumber()

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

        it("should fail when we claim zero points", async function () {
          const proof = tree.getHexProof(leaves[0])
          await expect(
            claim.connect(addr0).claimTokens(proof, socialID, 0)
          ).to.be.revertedWith("InvalidPoints()")
        })

        describe("when claims contract has a balance", async () => {
          beforeEach(async function () {
            await eco.transfer(claim.address, 2000)
          })

          it("should fail when the contract claim period has passed", async function () {
            await increase(claimDuration)
            const proof = tree.getHexProof(leaves[0])
            await expect(
              claim.connect(addr0).claimTokens(proof, socialID, points)
            ).to.be.revertedWith("ClaimPeriodEnded()")
          })

          it("should succeed when the proof and leaf match and emit an event", async function () {
            const proof = tree.getHexProof(leaves[0])

            await expect(
              claim.connect(addr0).claimTokens(proof, socialID, points)
            )
              .to.emit(claim, "Claim")
              .withArgs(socialID, addr0.address, ecoBalance)

            // check balances
            expect(await eco.balanceOf(addr0.address)).to.equal(ecoBalance)
          })

          it("should succeed when the claim period has not yet passed", async function () {
            await increase(claimDuration / 2)
            const proof = tree.getHexProof(leaves[0])

            await expect(
              claim.connect(addr0).claimTokens(proof, socialID, points)
            ).to.emit(claim, "Claim")
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
              .withArgs(socialID, addr0.address, ecoBalance)

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
              .withArgs(socialID, addr0.address, ecoBalance * 2)

            // check balances
            expect(await eco.balanceOf(addr0.address)).to.equal(ecoBalance * 2)
          })
        })
      })

      describe("when claiming on behalf of", async () => {
        beforeEach(async function () {
          await eco.transfer(claim.address, 1000)
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
            .withArgs(socialID, addr0.address, ecoBalance)

          // check balances
          expect(await eco.balanceOf(addr0.address)).to.equal(
            ecoBalance - feeAmount
          )
          expect(await eco.balanceOf(addr1.address)).to.equal(feeAmount)
        })
      })

      describe("when clawing back funds", async () => {
        const balance = 2000
        beforeEach(async function () {
          await eco.transfer(claim.address, balance)
        })

        it("should revert if the caller is not authorized", async function () {
          await expect(
            claim.connect(addr0).clawbackTokens()
          ).to.be.revertedWith("UnauthorizedClawbackAddress()")
        })

        it("should revert if claim period still in progress", async function () {
          await expect(
            claim.connect(owner).clawbackTokens()
          ).to.be.revertedWith("ClaimsInProgress()")
        })

        it("should claw back funds and emit an event", async function () {
          const ownerBalance = await eco.balanceOf(owner.address)
          await increase(claimDuration)

          await expect(claim.connect(owner).clawbackTokens())
            .to.emit(claim, "ClawbackTokens")
            .withArgs(owner.address, balance)

          // check balances
          expect(await eco.balanceOf(owner.address)).to.equal(
            ownerBalance.add(balance)
          )
          expect(await eco.balanceOf(claim.address)).to.equal(0)
        })
      })
    })
  })

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
