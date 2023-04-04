import { ethers } from "hardhat"

async function main() {
  const EcoIDContract = await ethers.getContractFactory("EcoID")
  const ClaimContract = await ethers.getContractFactory("EcoClaim")

  const feeData = await ethers.provider.getFeeData()
  const gasVal = ethers.utils.formatUnits(feeData.gasPrice!, "wei")
  const gasPrice = feeData.gasPrice?.mul(13).div(10)
  console.log(`Gas value: ${gasVal} and paying ${gasPrice}`)

  // Deploy EcoID
  const ecoIDContract = await EcoIDContract.deploy(
    process.env.ECO_ADDRESS as string,
    { gasPrice: gasPrice }
  )

  await ecoIDContract.deployed()

  console.log("EcoID Contract deployed to:", ecoIDContract.address)

  // Deploy Claim
  const claimContract = await ClaimContract.deploy(
    process.env.ECO_ADDRESS as string,
    process.env.ECOX_ADDRESS as string,
    ecoIDContract.address,
    process.env.VERIFIER_ADDRESS as string,
    process.env.CLAWBACK_ADDRESS as string,
    process.env.MERKLE_ROOT as string,
    process.env.MERKLE_DEPTH as string,
    { gasPrice: gasPrice }
  )

  await claimContract.deployed()

  console.log("Claim Contract deployed to:", claimContract.address)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
