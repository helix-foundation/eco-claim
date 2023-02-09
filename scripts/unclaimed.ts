import { ethers } from "hardhat"
import { EcoClaim } from "../typechain-types"
const fs = require("fs")
const path = require("path")

const USER_DATA_PATH = path.join(__dirname, "/gen/claim_points")
async function main() {
  console.log("start")
  const ecoClaimContract = (await ethers.getContractAt("EcoClaim", process.env.ECO_CLAIM_ADDRESS)) as EcoClaim

  const userData = await loadUserData(USER_DATA_PATH)
  const userSocials = Object.keys(userData)
  userSocials.forEach(async (social: string, index : number)=>{
    if(await ecoClaimContract._claimedBalances(social)){
      // @ts-ignore
      delete userData[social]
    }
  })

  return userData
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

async function loadUserData(
  file: string,
): Promise<Object> {
  return await new Promise<string[]>((resolve, reject) => {
    fs.readFile(file, 'utf8', (error: any, data: any) => {
      if (error) {
        console.log(error);
        reject(error)
      }
      resolve(JSON.parse(data))
    })
  })
}
