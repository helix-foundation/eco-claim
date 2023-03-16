import { EcoClaim } from "../typechain-types"
import { createMerkleTree } from "./utils/merkle"
import { loadClaimPoints, unclaimed } from "./utils/unclaimed"
import { ethers } from "hardhat"
const path = require("path")

const USER_DATA_PATH = path.join(__dirname, "/gen/migrate_claim_points")

async function main() {
    console.log("start")
    // @ts-ignore
    const ecoClaimContract = (await ethers.getContractAt(
        "EcoClaim",
        //@ts-ignore
        process.env.ECO_CLAIM_ADDRESS //address of the proxy contract
    )) as EcoClaim

    
    const discord = path.join(__dirname, "/input/discord-points-final.csv")
    const twitter = path.join(__dirname, "/input/twitter-points-final.csv")

    const unclaimedPoints = await unclaimed(await loadClaimPoints(USER_DATA_PATH), ecoClaimContract)
    
    await createMerkleTree(discord, twitter, unclaimedPoints)
    console.log("end")
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})

