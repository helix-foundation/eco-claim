import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ethers } from "hardhat"
import { EcoClaim, EcoID, EcoTest, EcoXTest } from "../../typechain-types"
import { MerkleTree } from "merkletreejs"
import keccak256 from "keccak256"
import { ClaimElement, MerkelLeaves } from "./types"

// An array of elements that represent the unique claim and redeemable token value for the EcoClaim contract
export const claimElements: ClaimElement[] = [
  { id: "t1", points: 120 },
  { id: "t2", points: 240 },
  { id: "t3", points: 360 },
  { id: "t4", points: 480 },
  { id: "t5", points: 600 },
  { id: "t6", points: 720 },
  { id: "t7", points: 840 },
]

/**
 * Deploys the {@link EcoID} and support {@link ERC20}
 *
 * @return All the contracts
 */
export async function deployEcoID(): Promise<[EcoTest, EcoID]> {
  const amount = 1000000000

  const EcoTest = await ethers.getContractFactory("EcoTest")
  const eco = await EcoTest.deploy("Eco", "Eco", amount)
  await eco.deployed()

  const EcoID = await ethers.getContractFactory("EcoID")
  const ecoID = await EcoID.deploy(eco.address)
  await ecoID.deployed()
  // @ts-ignore
  return [eco, ecoID]
}

/**
 * Deploys the {@link EcoID} and support {@link ERC20} with {@link deployEcoID}, and then the {@link EcoClaim} contract
 *
 * @return All the contracts and the merkeltree and its constituents
 */
export async function deployEcoClaim(
  trustedVerifier: SignerWithAddress,
  claims?: ClaimElement[],
  treeLeaves?: string[]
): Promise<
  [EcoTest, EcoXTest, EcoID, EcoClaim, MerkelLeaves, MerkleTree, string]
> {
  const [eco, ecoID] = await deployEcoID()

  const amount = 1000000000

  const EcoXTest = await ethers.getContractFactory("EcoXTest")
  const ecoX = await EcoXTest.deploy("EcoX", "EcoX", amount)
  await ecoX.deployed()

  let balancedLeaves: string[]
  if (claims) {
    // calculate the leaves
    const leaves = claims.map((x) =>
      ethers.utils.solidityKeccak256(["string", "uint256"], [x.id, x.points])
    )

    // balance the tree so that its leaves are a power of 2
    balancedLeaves = balanceMerkleTreeData(leaves)
  } else if (treeLeaves) {
    balancedLeaves = treeLeaves
  } else {
    throw Error("claims or treeLeaves must be set")
  }

  // calculate the tree and its root
  const tree = new MerkleTree(balancedLeaves, keccak256, {
    sortPairs: true,
  })
  const root = tree.getHexRoot()

  const EcoClaim = await ethers.getContractFactory("EcoClaim")
  const claim = await EcoClaim.deploy(
    eco.address,
    ecoX.address,
    ecoID.address,
    trustedVerifier.address,
    root,
    tree.getDepth()
  )
  await claim.deployed()
  // @ts-ignore
  return [eco, ecoX, ecoID, claim, balancedLeaves, tree, root]
}

/**
 * Balances the data of a merkle tree so that is has a power of 2 number of leaves.
 * Leaves are added till we get to a balances merkle leaves array. The leaves added
 * are a slice of the original array
 *
 * @param unbalancedLeaves array of unbalanced leaves
 * @returns the original array padded with blanks until its balanced
 */
export function balanceMerkleTreeData(unbalancedLeaves: string[]): string[] {
  const blank =
    "0x0000000000000000000000000000000000000000000000000000000000000000"
  if (unbalancedLeaves.length === 0) {
    return Array(2).fill(blank)
  }
  const unbalancedLength = unbalancedLeaves.length
  const pow2 = nextPowerOf2(unbalancedLength)
  const paddingLength = pow2 - unbalancedLength
  const balanced = unbalancedLeaves.concat(Array(paddingLength).fill(blank))

  return balanced
}

/**
 * Finds the next power of two greater or equal to the given number
 * @param index
 * @returns next power of two greater or equal to the given number
 */
export function nextPowerOf2(n: number): number {
  let count = 0

  if (n < 2) {
    return 2
  }

  // First n in the below condition
  // is for the case where n is 0
  if (n && !(n & (n - 1))) return n

  while (n !== 0) {
    n >>= 1
    count += 1
  }

  return 1 << count
}

// The zero address
export const ZERO_ADDR = ethers.constants.AddressZero
