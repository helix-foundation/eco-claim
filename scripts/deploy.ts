import { ethers } from "hardhat"

async function main() {
  const EcoIDContract = await ethers.getContractFactory("EcoID")
  const ClaimContract = await ethers.getContractFactory("EcoClaim")

  const feeData = await ethers.provider.getFeeData()
  const gasVal = ethers.utils.formatUnits(feeData.gasPrice!, "wei")
  const gasPrice = feeData.gasPrice?.mul(105).div(100)
  console.log(`Gas value: ${gasVal} and paying ${gasPrice}`)

  let ecoIDAddress = process.env.ECO_ID_ADDRESS 
  if (ecoIDAddress == undefined) {
    console.log(`process.env.ECO_ID_ADDRESS not set, deploying new EcoID contract`)
    // Deploy EcoID
    const ecoIDContract = await EcoIDContract.deploy(
      process.env.ECO_ADDRESS as string,
      { gasPrice: gasPrice }
    )

    await ecoIDContract.deployed()
    ecoIDAddress = ecoIDContract.address
    console.log("EcoID Contract deployed to:", ecoIDAddress)
  }else{
    console.log(`using process.env.ECO_ID_ADDRESS set to ${ecoIDAddress}`)
  }

  // Deploy Claim
  const claimContract = await ClaimContract.deploy(
    process.env.ECO_ADDRESS as string,
    ecoIDAddress,
    process.env.VERIFIER_ADDRESS as string,
    process.env.CLAWBACK_ADDRESS as string,
    process.env.MERKLE_ROOT as string,
    process.env.MERKLE_DEPTH as string,
    { gasPrice: gasPrice , gasLimit: 1400000}
  )

  await claimContract.deployed()

  console.log("Claim Contract deployed to:", claimContract.address)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
