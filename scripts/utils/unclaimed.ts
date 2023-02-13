import { ethers } from "hardhat"
import { EcoClaim } from "../../typechain-types"
const fs = require("fs")
const path = require("path")

const USER_DATA_PATH = path.join(__dirname, "/gen/claim_points")

// type for the points data {string: string}
export type PointsData = Object

/**
 * This method loads a the data for the merkele tree that a EcoClaim contract was initialized with.
 * It then returns all the social ids and their points that have not yet been claimed in the EcoClaim contract
 *
 * @param dataPath path of the points data file
 * @param ecoClaim the claim contract to check for unclaimed token allocations
 * @returns
 */
export async function unclaimed(
  dataPath: string,
  ecoClaim: EcoClaim
): Promise<PointsData> {
  const userData = await loadUserData(dataPath)
  const userSocials = Object.keys(userData)
  userSocials.forEach(async (social: string) => {
    if (await ecoClaim._claimedBalances(social)) {
      // @ts-ignore
      delete userData[social]
    }
  })
  return userData
}

/**
 * Reads the user id and points data from a json file
 * @param file the file to read from
 * @returns
 */
async function loadUserData(file: string): Promise<Object> {
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

async function main() {
  console.log("start")
  // @ts-ignore
  const ecoClaimContract = (await ethers.getContractAt(
    "EcoClaim",
    process.env.ECO_CLAIM_ADDRESS
  )) as EcoClaim

  await unclaimed(USER_DATA_PATH, ecoClaimContract)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
