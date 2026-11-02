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

describe("rateLimit com RATE_LIMIT_SCALE", () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_SCALE
  })

  const run = async (name: string, max: number, times: number) => {
    const { rateLimit } = await import("../rate-limit")
    const mw = rateLimit(name, { windowMs: 60_000, max })
    const r = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() } as any
    let blocked = 0
    for (let i = 0; i < times; i++) {
      const next = jest.fn()
      await mw({ headers: { "x-forwarded-for": "203.0.113.50" }, socket: {} } as any, r, next)
      if (!next.mock.calls.length) blocked++
    }
    return blocked
  }

  it("sem escala, bloqueia depois do limite", async () => {
    expect(await run("t-padrao", 3, 5)).toBe(2)
  })

  it("com escala 10, o mesmo limite comporta dez vezes mais", async () => {
    process.env.RATE_LIMIT_SCALE = "10"
    expect(await run("t-escala", 3, 30)).toBe(0)
    expect(await run("t-escala", 3, 5)).toBe(5)
  })
})
