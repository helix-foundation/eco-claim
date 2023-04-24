import { ethers } from "hardhat"

async function main() {
  const EcoClaimContract = await ethers.getContractFactory("EcoClaim");
  const claim = await EcoClaimContract.attach(
    process.env.ECO_CLAIM_ADDRESS || ''
  );
  
  console.log(`Clawback timestamp: ${await claim._claimPeriodEnd()}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
