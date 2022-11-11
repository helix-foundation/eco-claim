The repository contains the [EcoClaim](/contracts/EcoClaim.sol) contract, along with support tests and scripts. The EcoClaim contract is meant to distribute tokens to a set of accounts based on their eligibility, which is validated by looking up their ether accounts on the EcoID registry.

## Table of Contents

- [Build & Test](#build--test)
- [Claim Contract](#claim-contract)
- [Merkle Script](#merkle-script)
- [Deploy Script](#deploy-script)
- [Bug Bounty](#bug-bounty)
- [Contributing](#contributing)
- [License](#license)

## Build & Test

To build the project:

```
yarn build
```

To test the project:

```
yarn test
```

To run the linter and auto correct formatting issues:

```
yarn format
```

## Claim Contract

The [EcoClaim](/contracts/EcoClaim.sol) contract purpose is to hold and disburse funds to accounts in our community. A list of users and their points are generated off chain, then we take that list and generate a merkle tree out of it. The root of the merkle tree passed to the EcoClaim contract during construction, so that the contract can verify that a user is within that set later on. Each user in the user set, is entitled to both Eco and Ecox tokens in direct proportion to their point total. The contract allows users to make two claim; the first claim must be made within 1 year of the contract deploy, the second can be made at any point after the initial claim. If the initial claim for an account is not made within that 1 year, the user will effectively forfeit their tokens and not be able to claim any.

The first claim a participant makes rewards them with 5x their points balance in Eco, and 0.5x their points balance in Ecox. To make the first claim, the user calls the `function claimTokens(bytes32[] memory proof,string calldata socialID,uint256 points)` method or the `function claimTokensOnBehalf(bytes32[] memory proof,string calldata socialID,uint256 points,address recipient,uint256 feeAmount,uint256 deadline,bytes calldata recipientSig)` method. The latter allows for someone other than the participant to call claim on their behalf and be granted a fee in Eco for the service. The `claimTokensOnBehalf` method requires a EIP712 signature from the user.

The second claim a participant makes scales with the time the user takes to make it. The participant gets another 5x their points in Eco, and dynamic amount of Ecox based on how long the wait to call the second claim. The longer the user waits the greater the amount of Ecox they will be able to withdraw. This vesting schedule begins at the time of the first claim. The vesting schedule changes returns at 1, 6, 18, and 24 months after the first claim, with the returns being 0.5, 1.5, 2.5 and 3.5x their points in Ecox. To make the second claim, the user calls the `function releaseTokens(string calldata socialID)` method or the `function releaseTokensOnBehalf(string calldata socialID,address recipient,uint256 feeAmount,uint256 deadline,bytes calldata recipientSig)` method. The latter allows for someone other than the participant to call release on their behalf and be granted a fee in Eco for the service. The `releaseTokensOnBehalf` method requires a EIP712 signature from the user, and once the signature is release into the wild, anyone can call it on chain to `releaseTokensOnBehalf` for the user. The intended process for `releaseTokensOnBehalf` would be to only generate a release signature when you want to release your tokens at the vesting period.

## Merkle Script

The EcoClaim contract requires some configurations at initialization. The contract distributes tokens to a set of social accounts that is stored in a merkle tree off chain. These social accounts are either discord or twitter accounts. When the contract is called, it needs to check:

1. The inclusion of a given social account and its point total in its set for distribution
2. The ethereum address associated with the social account

To check for inclusion of a given social id in its set, the contract employs a merkle tree. The merkle tree is generated from the set of all social accounts. Each leaf of the tree is comprised of two variables: `{id: "discord:asdf", points: 123}` Once the tree is generated, the contract is initialized with the root and layer depth of the merkle tree. With those two variables, the contract can calculate whether a given social id and its corresponding points are included in that set without needing to store the whole set.

To auto generate the merkle tree and points lookup files:

```
yarn merkle
```

For the initial deploy of the EcoClaim contract, we generated and used these two files which you can find:

The hashtable matching the claim ids with their points: [local file](/raw/claim_points) or on [IPFS](https://ipfs.io/ipfs/QmawAKmYL95JbvjKGwh2QJQGbR1AbLffV3kdYaENKQjy2f)

The merkle tree can be found at: [local file](/raw/merkle_tree) or on [IPFS](https://ipfs.io/ipfs/QmVY2AfNC3ZQjmjT4P1fTADhckb2UDhb6Zr6EaJxKDw2N1)

## Deploy Script

The Eco ID system can be deployed to a test or mainnet chain by using the [deploy](/scripts/deploy.ts) script. The script first deploys the [EcoID](https://github.com/helix-foundation/eco-id/blob/main/contracts/EcoID.sol) contract, and then deploys the [EcoClaim](/contracts/EcoClaim.sol) contract. In order for the script to work, it needs several environmental variables set such as the addresses of the Eco and Ecox tokens to use for the nft and claims contracts; as well as some other deploy specific variables such as infura endpoints. The [deploy](/scripts/deploy.ts) script can be read to figure out all the environmental variables that are necessary. There is also a [.env.example](/.env.example) file with the list of all enviromnetal variable used in all the scripts, and not just the deploy script. The [deploy](/scripts/deploy.ts) script is set up to pull credentials from a `.env` file in the project root, that is intentionally ignored in [.gitingnore](./.gitignore) for security reasons.

To deploy the Eco ID system to the goerli ethereum network:

```
yarn deploy
```

The network the contracts are deployed to can be changed by editing the `deploy` command in [package.json](./package.json) and changing the `--network goerli` to the desired network. Note if you do change the deploy network, you will also have to ensure that your infura endpoints and private key are valid for that network in [hardhat.config.ts](./hardhat.config.ts)

## Bug Bounty

This repo is covered by an [ImmuneFi Bug Bounty](https://immunefi.com/bounty/eco/). To submit bugs, please sign up on the ImmuneFi platform and submit your bug! 

## Contributing

Contributions are welcome. Please submit any issues as issues on GitHub, and open a pull request with any contributions.

## License

[MIT (c) Helix Foundation](./LICENSE)
