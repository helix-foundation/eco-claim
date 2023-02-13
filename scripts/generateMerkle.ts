import { createMerkleTree } from "./utils/merkle"
const path = require("path")

async function main() {
  const discord = path.join(__dirname, "/input/discord-points-final.csv")
  const twitter = path.join(__dirname, "/input/twitter-points-final.csv")
  await createMerkleTree(discord, twitter)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
