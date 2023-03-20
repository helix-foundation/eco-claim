import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { BigNumber } from "ethers"
import fs from "fs"
import { ethers } from "hardhat"
import MerkleTree from "merkletreejs"
import { EcoClaim, EcoID, EcoTest, EcoXTest } from "../typechain-types"
import { deployEcoClaim } from "./utils/fixtures"
import keccak256 from "keccak256"
import { ClaimElement } from "../scripts/utils/types"
import { mintNftForUser } from "./eco_claim_test"
import { fail } from "assert"
const path = require("path")

/**
 * This tests the deploy merkle tree against the points distribution. Purpose is to verify that
 * all the merkle tree is valid. This test takes about 240s so its only done locally, hence the skip.
 *
 * NOTE: mocha might timeout during this long test, so add the following to the hardhat.config.ts file
 *
 * ```
 *       mocha: {
 *           timeout: 100000000
 *       }
 * ```
 */
describe.skip("Eco Deploy tests", async function () {
  let owner: SignerWithAddress, addr0: SignerWithAddress
  let eco: EcoTest
  let ecoX: EcoXTest
  let ecoID: EcoID
  let claim: EcoClaim
  let deployedTree: MerkleTree, tree: MerkleTree
  let ecoXRatio: BigNumber
  const claims: ClaimElement[] = []

  let totalEcoRewarded: BigNumber, totalEcoXRewarded: BigNumber
  before(async function () {
    const treeFile = path.join(__dirname, "../raw/merkle_tree")

    const rawTreedata = fs.readFileSync(treeFile)
    const merkleData = JSON.parse(rawTreedata.toString())
    // calculate the tree and its root
    deployedTree = new MerkleTree(merkleData.leaves, keccak256, {
      sortPairs: true,
    })

    const pointsFile = path.join(__dirname, "../raw/claim_points")
    const rawPointsdata = fs.readFileSync(pointsFile)
    const pointsData = JSON.parse(rawPointsdata.toString())

    for (const key in pointsData) {
      claims.push({ id: key, points: pointsData[key] })
    }

    ;[owner, addr0] = await ethers.getSigners()
    ;[eco, ecoX, ecoID, claim, , tree] = await deployEcoClaim(owner, claims)
    totalEcoRewarded = BigNumber.from(merkleData.points).mul(10)
    totalEcoXRewarded = BigNumber.from(merkleData.points).mul(4)
    await eco.transfer(claim.address, totalEcoRewarded)
    await ecoX.transfer(claim.address, totalEcoXRewarded)

    ecoXRatio = BigNumber.from((await claim.POINTS_TO_ECOX_RATIO()).toNumber())
  })

  it("should match roots between both trees", async function () {
    expect(deployedTree.getHexRoot()).to.equal(tree.getHexRoot())
  })

  it("should allow everyone to claim", async function () {
    let originalEcoBalance = await eco.balanceOf(addr0.address)
    let originalEcoXBalance = await ecoX.balanceOf(addr0.address)

    for (let i = 0; i < claims.length; i++) {
      const data = claims[i]
      await mintNftForUser(data, addr0, ecoID, owner)

      const proof = tree.getHexProof(deployedTree.getLeaves()[i])
      // make sure no empty proof hash in case of blank leaf. Openzepplin does
      // not support an empty leaf
      if (proof.find((hash) => hash.length !== 66)) {
        fail("empty proof hash")
      }

      const points = BigNumber.from(data.points)
      const ecoBalance = points.mul(
        BigNumber.from((await claim.POINTS_MULTIPLIER()).toNumber())
      )
      const ecoXBalance = points.div(ecoXRatio)
      await expect(claim.connect(addr0).claimTokens(proof, data.id, points))
        .to.emit(claim, "Claim")
        .withArgs(data.id, addr0.address, ecoBalance, ecoXBalance)

      // check balances
      originalEcoBalance = originalEcoBalance.add(ecoBalance)
      originalEcoXBalance = originalEcoXBalance.add(ecoXBalance)
      expect(await eco.balanceOf(addr0.address)).to.equal(originalEcoBalance)
      expect(await ecoX.balanceOf(addr0.address)).to.equal(originalEcoXBalance)
      if (i % 200 === 0) {
        console.log(`Claiming for ${i}`)
        console.log(`Eco ${originalEcoBalance}`)
        console.log(`EcoX ${originalEcoXBalance}`)
      }
    }

    expect(originalEcoBalance.toString()).to.equal(
      totalEcoRewarded.div(BigNumber.from(2)) // half the eco should be claimed
    )
    expect(originalEcoXBalance.toString()).to.equal(
      totalEcoXRewarded.div(BigNumber.from(8)) // 1/8 of the ecox should be claimed
    )
  })
})
