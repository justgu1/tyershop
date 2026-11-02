import { createHmac } from "crypto"
import { isValidMpSignature } from "../service"

const secret = "segredo-de-teste"
const sign = (id: string, requestId: string, ts: number) =>
  createHmac("sha256", secret).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest("hex")

describe("isValidMpSignature", () => {
  const now = 1_800_000_000_000
  const headers = (v1: string, ts = now) => ({ "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "req-1" })

  it("accepts a correct signature", () => {
    expect(isValidMpSignature(secret, headers(sign("ABC123", "req-1", now)), "ABC123", now)).toBe(true)
  })

  it("rejects a wrong secret, tampered id and missing headers", () => {
    expect(isValidMpSignature("outro", headers(sign("ABC123", "req-1", now)), "ABC123", now)).toBe(false)
    expect(isValidMpSignature(secret, headers(sign("ABC123", "req-1", now)), "999", now)).toBe(false)
    expect(isValidMpSignature(secret, undefined, "ABC123", now)).toBe(false)
  })

  it("rejects an old timestamp (replay)", () => {
    const old = now - 11 * 60 * 1000
    expect(isValidMpSignature(secret, headers(sign("ABC123", "req-1", old), old), "ABC123", now)).toBe(false)
  })
})
