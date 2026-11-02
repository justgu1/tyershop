import { clientIp } from "../rate-limit"

const req = (headers: Record<string, string>, remote = "10.0.0.9") => ({ headers, socket: { remoteAddress: remote } }) as any

describe("clientIp", () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_IP_HEADER
  })

  it("ignores client-written cf-connecting-ip by default and uses the last forwarded hop", () => {
    expect(clientIp(req({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("203.0.113.7")
  })

  it("trusts the configured header when the origin only accepts Cloudflare", () => {
    process.env.RATE_LIMIT_IP_HEADER = "cf-connecting-ip"
    expect(clientIp(req({ "cf-connecting-ip": "198.51.100.4", "x-forwarded-for": "172.70.0.1" }))).toBe("198.51.100.4")
  })

  it("falls back to the socket address", () => {
    expect(clientIp(req({}))).toBe("10.0.0.9")
  })
})
