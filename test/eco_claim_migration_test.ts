// chai testing framework for unclaimed.ts
// const path = require("path")
// const USER_DATA_PATH = path.join(__dirname, "/gen/migrate_claim_points")
// const discord = path.join(__dirname, "/input/discord-points-final.csv")
// const twitter = path.join(__dirname, "/input/twitter-points-final.csv")

// import { expect } from "chai"
// import { ethers } from "hardhat"
// import { EcoClaim } from "../typechain-types"
// import { unclaimed, loadClaimPoints } from "../scripts/utils/unclaimed"
// import { ClaimElement, PointsData } from "../scripts/utils/merkle"
// 
// describe("Unclaimed", () => {
//   let ecoClaimContract: EcoClaim
//   let claimPoints: PointsData
//   let claims: ClaimElement[]
// 
//   before(async () => {
//     // @ts-ignore
//     ecoClaimContract = (await ethers.getContractAt(
//       "EcoClaim",
//       //@ts-ignore
//       process.env.ECO_CLAIM_ADDRESS //address of the proxy contract
//     )) as EcoClaim
// 
//     claimPoints = await loadClaimPoints(path.join(__dirname, "/gen/migrate_claim_points"))
//     claims = toClaimElements(claimPoints)
//   })
// 
//   it("should return unclaimed points", async () => {
//     const unclaimedPoints = await unclaimed(claimPoints, ecoClaimContract)
//     expect(Object.keys(unclaimedPoints).length).to.equal(claims.length)
//   })
// 
//   it("should remove claimed points", async () => {
//     await ecoClaimContract.claim(claims[0].id, claims[0].points, "0x00", "0x00")
//     const unclaimedPoints = await unclaimed(claimPoints, ecoClaimContract)
//     expect(Object.keys(unclaimedPoints).length).to.equal(claims.length - 1)
//   })
// })
// 
// 
// chai testing framework for merkle.ts
// import { expect } from "chai"
// import { ethers } from "hardhat"
// import { EcoClaim } from "../typechain-types"
// import { unclaimed, loadClaimPoints } from "../scripts/utils/unclaimed"
// import { ClaimElement, PointsData } from "../scripts/utils/merkle"
// 
// describe("Unclaimed", () => {
//   let ecoClaimContract: EcoClaim
//   let claimPoints: PointsData
//   let claims: ClaimElement[]
// 
//   before(async () => {
//     // @ts-ignore
//     ecoClaimContract = (await ethers.getContractAt(
//       "EcoClaim// const path = require("path")
// const USER_DATA_PATH = path.join(__dirname, "/gen/migrate_claim_points")
// const discord = path.join(__dirname, "/input/discord-points-final.csv")
// const twitter = path.join(__dirname, "/input/twitter-points-final.csv")