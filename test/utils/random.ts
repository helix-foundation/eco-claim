import { expect } from "chai"

/**
 * Custom function for testing async functions that should throw an error
 * @param method the async function to test
 * @param errorMessage the error message to expect
 */
export async function expectThrowsAsync(method: any, errorMessage: any) {
  let error: Error
  try {
    await method()
  } catch (err: any) {
    error = err
    expect(error).to.be.an("Error")
    if (errorMessage) {
      expect(error.message).to.equal(errorMessage)
    }
    return
  }

  expect.fail(`Error was not thrown: expected "${errorMessage}"`)
}
