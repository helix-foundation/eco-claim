import { expect } from "chai"
import { ethers } from "hardhat"
import { EcoClaim, EcoID, EcoTest } from "../typechain-types"
import { unclaimed } from "../scripts/utils/unclaimed"
import { ClaimElement, MerkelLeaves } from "../scripts/utils/types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { MerkleTree } from "merkletreejs"
import { claimElements, deployEcoClaim } from "./utils/fixtures"
import { createMerkleTree } from "../scripts/utils/merkle"
import { expectThrowsAsync } from "./utils/random"
import { mintNftForUser } from "./eco_claim_test"

describe("Claim deploy tests", () => {
  let owner: SignerWithAddress, addr0: SignerWithAddress
  let eco: EcoTest
  let ecoID: EcoID
  let claim: EcoClaim
  let leaves: MerkelLeaves
  let tree: MerkleTree

  beforeEach(async () => {
    ;[owner, addr0] = await ethers.getSigners()
    ;[eco, ecoID, claim, leaves, tree] = await deployEcoClaim(
      owner,
      claimElements
    )
  })

  it("should fail when the input data doesn't match the merkle root", async () => {
    // subarray of claimElements that is 2 smaller
    const wrongelements = claimElements.slice(0, claimElements.length - 2)
    await expectThrowsAsync(
      () => unclaimed(wrongelements, claim),
      "Merkle tree root does not match contract"
    )
  })

  it("should succeed when the input data matchs the merkle root", async () => {
    const elements = await unclaimed(claimElements, claim)
    expect(Object.keys(elements).length).to.equal(claimElements.length)
  })

  describe("when not migrating from a past merkle tree", () => {
    it("should return the same number of claims when creating a merkle tree", async () => {
      const claims = await createMerkleTree(claimElements)
      expect(Object.keys(claims).length).to.equal(claimElements.length)
    })
  })

  describe("when migrating from a past merkle tree", () => {
    beforeEach(async function () {
      await eco.transfer(claim.address, 2000000)

      // loop over claimElements and mint nfts for each
      for (const element of claimElements) {
        await mintNftForUser(element, addr0, ecoID, owner)
      }
    })

    describe("when no claims on the previous merkle tree", () => {
      it("should create a tree with just the new claims when no claims on the previous merkle tree", async () => {
        const sumClaims = await createMerkleTree(claimElements, [])

        // check no duplication of elements
        expect(Object.keys(sumClaims).length).to.equal(claimElements.length)

        for (const [index, claim] of Object.entries(sumClaims)) {
          // @ts-ignore
          expect(claim.points).to.equal(claimElements[index].points)
        }
      })
    })

    describe("when some claims on the previous merkle tree", () => {
      it("should create a tree with the few previous unclaimed leaves added to the new claims", async () => {
        const claimed = claimElements.slice(0, 2).map((x) => x)
        const sumClaims = await createMerkleTree(claimElements, claimed)

        // check no duplication of elements
        expect(Object.keys(sumClaims).length).to.equal(claimElements.length)

        for (const [index, claim] of Object.entries(sumClaims)) {
          // @ts-ignore
          if (index < 2) {
            // @ts-ignore
            expect(claim.points).to.equal(claimElements[index].points * 2)
            continue
          }
        }
      })

      it("should create a tree with different unclaimed social elements plus the new claims", async () => {
        const claimed: ClaimElement[] = [
          { id: "a1", points: 123 },
          { id: "a2", points: 345 },
        ]
        const sumClaims = await createMerkleTree(claimElements, claimed)

        // check no duplication of elements
        expect(Object.keys(sumClaims).length).to.equal(
          claimElements.length + claimed.length
        )
        const start = claimElements.length - 1
        for (const [index, claim] of Object.entries(sumClaims)) {
          // @ts-ignore
          if (index > start) {
            // @ts-ignore
            expect(claim.points).to.equal(claimed[index - start - 1].points)
            continue
          }
        }
      })
    })

    describe("when checking claims contract for unclaimed points", () => {
      it("should return all points as unclaimed", async () => {
        const unclaimedPoints = await unclaimed(claimElements, claim)
        expect(Object.keys(unclaimedPoints).length).to.equal(
          claimElements.length
        )
      })

      it("should return a subset when some points are claimed ", async () => {
        const claimed_points = 2
        for (let index = 0; index < claimed_points; index++) {
          await expect(
            claim
              .connect(addr0)
              .claimTokens(
                tree.getHexProof(leaves[index]),
                claimElements[index].id,
                claimElements[index].points
              )
          ).to.emit(claim, "Claim")
        }

        const unclaimedPoints = await unclaimed(claimElements, claim)

        expect(Object.keys(unclaimedPoints).length).to.equal(
          claimElements.length - claimed_points
        )
      })

      it("should return a just the new set when all points are claimed ", async () => {
        const claimed_points = claimElements.length
        for (let index = 0; index < claimed_points; index++) {
          await expect(
            claim
              .connect(addr0)
              .claimTokens(
                tree.getHexProof(leaves[index]),
                claimElements[index].id,
                claimElements[index].points
              )
          ).to.emit(claim, "Claim")
        }

        const unclaimedPoints = await unclaimed(claimElements, claim)
        expect(Object.keys(unclaimedPoints).length).to.equal(0)
      })
    })

    describe("when generating a new claim contract", () => {
      it("should return all points as unclaimed", async () => {
        const unclaimedPoints = await unclaimed(claimElements, claim)
        expect(Object.keys(unclaimedPoints).length).to.equal(
          claimElements.length
        )
      })
    })
  })
})
