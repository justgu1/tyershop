import { canViewInBrowser, validViewToken, viewToken, viewUrlFor } from "../token"

describe("view token", () => {
  it("accepts the token of the same notification and rejects another one", () => {
    expect(validViewToken("noti_1", viewToken("noti_1"))).toBe(true)
    expect(validViewToken("noti_2", viewToken("noti_1"))).toBe(false)
    expect(validViewToken("noti_1", "")).toBe(false)
  })

  it("builds the public link with the id and its token", () => {
    const url = viewUrlFor("ticket", "noti_1")!
    expect(url).toContain("/email/noti_1?t=")
    expect(url.endsWith(viewToken("noti_1"))).toBe(true)
  })

  it("never gives the password reset e-mail a public page", () => {
    expect(canViewInBrowser("password_reset")).toBe(false)
    expect(viewUrlFor("password_reset", "noti_1")).toBeUndefined()
  })

  it("has no link without a notification id", () => {
    expect(viewUrlFor("ticket", undefined)).toBeUndefined()
  })
})
