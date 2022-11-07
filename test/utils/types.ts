// The element of a claim that we hash into leaves for the MerkelTree for the EcoClaim contract
export type ClaimElement = {
  id: string
  points: number | string
}

// The type for the leaves array that is generated during deployClaim
export type MerkelLeaves = string[]
