import { MerkleTree } from "merkletreejs"
import { ethers } from "hardhat"
import { BigNumber } from "ethers"
import { balanceMerkleTreeData } from "../../test/utils/fixtures"
import { ClaimElement } from "../../test/utils/types"
import { PointsData } from "./unclaimed"
const fs = require("fs")
const { parse } = require("csv-parse")
const path = require("path")

// the conversion from one ece/point to weico that is how the erc20 stores values, 1e18
export const WEICO_CONSTANT = 18

// the posible prefixes for the two social networks' ids
export type IDPrefix = "discord:" | "twitter:"

export type ClaimsMerkleTree = {
  root: string
  depth: number
  points: string
  leaves: string[]
}

/**
 * Creates a merkle tree for the input points csv and any carry over points
 * from a previous trees leaves
 *
 * @param discordFilePath path to csv file for discord points
 * @param twitterFilePath path to csv file for twitter points
 * @param carryOverPoints any other points that should be added as leaves to the tree
 */
export async function createMerkleTree(
  discordFilePath: string,
  twitterFilePath: string,
  carryOverPoints?: PointsData
) {
  // get all the csv data into an array
  const data = await Promise.all([
    await loadCsvPointsData(discordFilePath, "discord:"),
    await loadCsvPointsData(twitterFilePath, "twitter:"),
  ])

  // merge the array data
  const claims = data.reduce((sum, i) => sum.concat(i))

  // create gen dir if it doesn't exist
  const dir = path.join(__dirname, "/gen")
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }

  const claimPoints = {}
  // @ts-ignore
  claims.forEach((claim) => (claimPoints[claim.id] = claim.points))

  if (carryOverPoints) {
    // todo  call unclaimed and include those into claims array
    // todo need to pass ecoclaim contract in and make tests
  }

  // write the id-points into a file
  fs.writeFile(
    path.join(dir, "/claim_points"),
    Buffer.from(JSON.stringify(claimPoints)),
    function (err: any) {
      if (err) {
        return console.log(err)
      }
      console.log("The claim_points file was saved!")
    }
  )

  // generate the root and leaves hashes
  const claimsTree = generateTree(claims)

  // write the root and leaves into a json array file
  fs.writeFile(
    path.join(dir, "/merkle_tree"),
    Buffer.from(JSON.stringify(claimsTree)),
    function (err: any) {
      if (err) {
        return console.log(err)
      }
      console.log("The claims_merkel_tree file was saved!")
    }
  )
}

/**
 * Generates a merkel tree for the given points data
 *
 * @param claims the user id and points that make up the leaves of the merkle tree
 * @returns
 */
export function generateTree(claims: ClaimElement[]): ClaimsMerkleTree {
  // calculate the leaves
  const unbalancedLeaves = claims.map((x) =>
    ethers.utils.solidityKeccak256(["string", "uint256"], [x.id, x.points])
  )
  console.log(`Unbalanced leaves length ${unbalancedLeaves.length}`)

  // balance the tree so that its leaves are a power of 2
  const leaves = balanceMerkleTreeData(unbalancedLeaves)
  console.log(`Balanced leaves length ${leaves.length}`)

  // calculate the tree and its root
  const tree = new MerkleTree(leaves, ethers.utils.keccak256, {
    sortPairs: true,
  })

  // calculate the total points in weico
  let total = BigNumber.from("0")
  claims.forEach((claim) => {
    total = total.add(BigNumber.from(claim.points))
  })
  const points = total.toString()
  console.log("Total points *1E18 : " + points)

  const root = tree.getHexRoot()
  const depth = tree.getDepth()

  // verify tree is balanced
  if (Math.pow(2, depth) !== leaves.length) {
    throw Error("Merkle tree is unbalanced")
  }
  leaves.forEach((leaf) => {
    if (tree.getHexProof(leaf).length !== depth) {
      throw Error("Merkle tree is unbalanced")
    }
  })

  return { root, depth, points, leaves }
}

/**
 * Reads a csv file full of social id's and their corresponding points balances
 *
 * @param filename the csv file to read from
 * @param idPrefix the prefix to append to the ids found in the file
 * @returns
 */
export async function loadCsvPointsData(
  filename: string,
  idPrefix: IDPrefix
): Promise<ClaimElement[]> {
  return await new Promise<ClaimElement[]>((resolve, reject) => {
    const data: ClaimElement[] = []
    fs.createReadStream(filename)
      .pipe(parse({ delimiter: ",", from_line: 2 }))
      .on("error", (err: any) => reject(err))
      .on("data", (row: any) => {
        const rawPoints = row[1]
        if (Number.parseInt(rawPoints) > 0) {
          try {
            data.push({
              id: idPrefix + row[0],
              points: weicofyPoint(rawPoints),
            })
          } catch (err: any) {
            reject(err)
          }
        }
      })
      .on("end", () => resolve(data))
  })
}

/**
 * Converts a floating point from a raw cvs dump, into a fixed number scaled to weico
 *
 * @param rawPoint the raw point number from the discord/twitter csv dump
 * @returns
 */
export function weicofyPoint(rawPoint: string): string {
  const arr = rawPoint.split(".")
  let decimal = arr[1].substring(0, WEICO_CONSTANT)

  if (arr.length !== 2) {
    throw Error("variable not valid : " + rawPoint)
  }

  decimal += "0".repeat(WEICO_CONSTANT - decimal.length)
  if (decimal.length !== WEICO_CONSTANT) {
    throw Error("invalid scaling")
  }
  return arr[0] + decimal
}
