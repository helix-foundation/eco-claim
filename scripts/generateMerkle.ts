import { createMerkleTree, parseData } from "./utils/merkle"
const path = require("path")

async function main() {
  const discordFilePath = path.join(
    __dirname,
    "/input/discord-points-final-test.csv"
  )
  // const twitterFilePath = path.join(
  //   __dirname,
  //   "/input/twitter-points-final.csv"
  // )

  const claims = await parseData([
    { filepath: discordFilePath, prefix: "discord:" },
    // { filepath: twitterFilePath, prefix: "twitter:" },
  ])

  await createMerkleTree(claims)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
