import { ethers } from "hardhat"
import { ClaimElement } from "../../test/utils/types"
import { EcoClaim } from "../../typechain-types"
import { generateTree, toClaimElements } from "./merkle"
const fs = require("fs")
const path = require("path")

// type for the points data {string: string}
export type PointsData = Object

/**
 * This method loads the data for the merkele tree that a EcoClaim contract was initialized with.
 * It then returns all the social ids and their points that have not yet been claimed in the EcoClaim contract
 *
 * @param claimPoints the claim points to check for unclaimed token allocations
 * @param ecoClaim the claim contract to check for unclaimed token allocations
 * @returns
 */
export async function unclaimed(
  claimPoints: PointsData,
  ecoClaim: EcoClaim
): Promise<PointsData> {
  //verify that the input data matches the merkle root of the current contract
  await verifyTreeRoot(toClaimElements(claimPoints), await ecoClaim._pointsMerkleRoot())

  const unclaimedPoints = getUnclaimedPoints(claimPoints, ecoClaim)
  return unclaimedPoints
}

/**
 * Reads the claim points from a json file
 * @param file the file to read from
 * @returns
 */
export async function loadClaimPoints(file: string): Promise<Object> {
  return await new Promise<string[]>((resolve, reject) => {
    fs.readFile(file, "utf8", (error: any, data: any) => {
      if (error) {
        console.log(error)
        reject(error)
      }
      resolve(JSON.parse(data))
    })
  })
}

/**
 * Removes any points data that has already been claimed in the EcoClaim contract
 * @param claimPoints the points data to filter
 * @param ecoClaim the EcoClaim contract to check for claimed points
 * @returns the filtered points data
 */
function getUnclaimedPoints(claimPoints: PointsData, ecoClaim: EcoClaim) : PointsData{
  const claimPointsIDs = Object.keys(claimPoints)
  claimPointsIDs.forEach(async (social: string) => {
    if (await ecoClaim._claimedBalances(social)) {
      // @ts-ignore
      delete claimPoints[social]
    }
  })
  return claimPoints
}

/**
 * Verifies that the merkle tree root of the input data matches the merkle tree root of the contract.
 * Throws an error if the roots do not match.
 *
 * @param claims the input data to verify
 * @param treeRoot the merkle tree root of the contract
 */
function verifyTreeRoot(claims: ClaimElement[], treeRoot: string) {
  const {root} = generateTree(claims)
  if (root !== treeRoot) {
    throw new Error("Merkle tree root does not match contract")
  }
}

