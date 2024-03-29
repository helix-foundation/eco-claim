import { MerkleTree } from "merkletreejs"
import { ethers } from "hardhat"
import { BigNumber } from "ethers"
import { balanceMerkleTreeData } from "../../test/utils/fixtures"
import { ClaimElement, PointsData } from "./types"
const fs = require("fs")
const { parse } = require("csv-parse")
const path = require("path")

// the conversion from one ece/point to weico that is how the erc20 stores values, 1e18
export const WEICO_CONSTANT = 18

// create gen dir if it doesn't exist
const dir = path.join(__dirname, "../gen")

// the posible prefixes for the two social networks' ids
export type IDPrefix = "discord:" | "twitter:"

/**
 * Typeing for loading scv points files
 */
type CsvPointsFile = {
  filepath: string
  prefix: string
}

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
 * @param inputClaims the claim elements to create a new merkle tree for
 * @param unclaimedPoints points that are getting carried over from a previous tree
 * @returns the claims that make up the leaves of the merkle tree
 */
export async function createMerkleTree(
  inputClaims: ClaimElement[],
  unclaimedPoints?: ClaimElement[]
): Promise<ClaimElement[]> {
  // copy input so we don't mutate it
  const claims: ClaimElement[] = structuredClone(inputClaims)

  if (unclaimedPoints) {
    // loop over unclaimed points and add them to the claims
    for (const [, unclaimed] of Object.entries(unclaimedPoints)) {
      const claim = claims.find((x) => x.id === unclaimed.id)
      if (claim) {
        // add the points to the existing claim
        // @ts-ignore
        claim.points += unclaimed.points
      } else {
        // add a new claim
        claims.push({ id: unclaimed.id, points: unclaimed.points })
      }
    }
  }

  await saveGeneratedData("claim_points", toClaimPoints(claims))

  // generate the root and leaves hashes
  const claimsTree = generateTree(claims)

  // write the root and leaves into a json array file
  await saveGeneratedData("merkle_tree", claimsTree)

  return claims
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
  // console.log(`Unbalanced leaves length ${unbalancedLeaves.length}`)

  // balance the tree so that its leaves are a power of 2
  const leaves = balanceMerkleTreeData(unbalancedLeaves)
  // console.log(`Balanced leaves length ${leaves.length}`)

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
  // console.log("Total points *1E18 : " + points)

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
 * Parses the csv file and returns the data as an array of ClaimElements for merkle tree and the points data for
 * saving to a file to serve as the source of the merkle tree
 *
 * @param files csv files to parse
 * @returns
 */
export async function parseData(
  files: CsvPointsFile[]
): Promise<ClaimElement[]> {
  const fileReadData: ClaimElement[][] = []
  // read all files into an array
  // using Promise.all to wait for all promises to resolve
  const data = await Promise.all(
    files.map(async function (file) {
      return Promise.all(await loadCsvPointsData(file))
    })
  )

  // merge the array data
  const claims = data.reduce((sum, i) => sum.concat(i))

  return claims
}

/**
 * Converts the claim elements into a hashmap of id to points
 *
 * @param claims the user id and points that make up the leaves of the merkle tree
 * @returns
 */
export function toClaimPoints(claims: ClaimElement[]): PointsData {
  const claimPoints = {}
  // @ts-ignore
  claims.forEach((claim) => (claimPoints[claim.id] = claim.points))

  return claimPoints
}

/**
 * Converts the claim points from a hashmap into an array of ClaimElements
 *
 * @param claimPoints
 * @returns
 */
export function toClaimElements(claimPoints: PointsData): ClaimElement[] {
  const claims: ClaimElement[] = []
  for (const [id, points] of Object.entries(claimPoints)) {
    claims.push({ id, points })
  }

  return claims
}

/**
 * Saves generated data to a local file
 *
 * @param fileName filename to save the data to
 * @param data the data to save
 */
async function saveGeneratedData(fileName: string, data: any) {
  // create gen dir if it doesn't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }

  // write the id-points into a file
  fs.writeFile(
    path.join(dir, `/${fileName}`),
    Buffer.from(JSON.stringify(data)),
    function (err: any) {
      if (err) {
        return console.log(err)
      }
      // console.log(`The ${fileName} file was saved!`)
    }
  )
}
/**
 * Reads a csv file full of social id's and their corresponding points balances
 *
 * @param file the csv file to read from and its account prefixes
 * @returns
 */
export async function loadCsvPointsData(
  file: CsvPointsFile
): Promise<ClaimElement[]> {
  return await new Promise<ClaimElement[]>((resolve, reject) => {
    const data: ClaimElement[] = []
    fs.createReadStream(file.filepath)
      .pipe(parse({ delimiter: ",", from_line: 2 }))
      .on("error", (err: any) => reject(err))
      .on("data", (row: any) => {
        const rawPoints = row[1]
        if (Number.parseFloat(rawPoints) > 0) {
          try {
            data.push({
              id: file.prefix + row[0],
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
  let decimal = Number.parseInt(arr[1].substring(0, WEICO_CONSTANT)).toString() // truncate to 18 decimal places and then remove any leading zeros with parseInt

  if (arr.length !== 2) {
    throw Error("variable not valid : " + rawPoint)
  }

  decimal += "0".repeat(WEICO_CONSTANT - decimal.length)
  if (decimal.length !== WEICO_CONSTANT) {
    throw Error("invalid scaling")
  }
  let wholeNumber = Number.parseInt(arr[0]).toString()//remove any leading zeros
  wholeNumber = wholeNumber == "0" ? "" : "" + wholeNumber // if the whole number is 0, then we don't want to add a 0 to the front of the decimal
  return wholeNumber + decimal
}
