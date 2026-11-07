import { buildPackage, servicesFor, shippingOptionDataId, SERVICES } from "../quote"
import { consumeState, signState, verifyState } from "../state"

describe("buildPackage", () => {
  it("uses the default package for a single item without measures", () => {
    expect(buildPackage([{ variant_id: "v", quantity: 1 }])).toEqual({ weight: 0.4, length: 30, width: 25, height: 5 })
  })

  it("sums weight and stacks heights, keeping the largest length and width", () => {
    const pkg = buildPackage([
      { variant_id: "a", quantity: 2, weight: 300, length: 20, width: 15, height: 3 },
      { variant_id: "b", quantity: 1, weight: 500, length: 35, width: 20, height: 4 },
    ])
    expect(pkg).toEqual({ weight: 1.1, length: 35, width: 20, height: 10 })
  })

  it("respects the Melhor Envio minimums", () => {
    const pkg = buildPackage([{ variant_id: "a", quantity: 1, weight: 10, length: 1, width: 1, height: 1 }])
    expect(pkg).toEqual({ weight: 0.1, length: 16, width: 11, height: 2 })
  })
})

describe("oauth state", () => {
  beforeAll(() => {
    process.env.COOKIE_SECRET = "segredo-de-teste-do-state"
  })

  it("accepts a fresh signed state and rejects tampering and old states", () => {
    const now = 1_800_000_000_000
    const state = signState(now)
    expect(verifyState(state, now + 60_000)).toEqual(expect.any(String))
    // Troca o último caractere por outro diferente: com "0" fixo o teste passava a ser inócuo quando o estado já terminava em 0.
    const tampered = state.slice(0, -1) + (state.endsWith("0") ? "1" : "0")
    expect(verifyState(tampered, now)).toBeNull()
    expect(verifyState(state, now + 16 * 60_000)).toBeNull()
    expect(verifyState(undefined)).toBeNull()
  })

  it("lets each state be consumed only once", async () => {
    const nonce = verifyState(signState())!
    expect(await consumeState(nonce)).toBe(true)
    expect(await consumeState(nonce)).toBe(false)
  })

  it("refuses to sign without a real secret", () => {
    const prev = process.env.COOKIE_SECRET
    process.env.COOKIE_SECRET = "supersecret"
    expect(() => signState()).toThrow(/COOKIE_SECRET/)
    process.env.COOKIE_SECRET = prev
  })
})

describe("shippingOptionDataId", () => {
  it("o id do dado da opção de envio é melhorenvio-<serviço>, o formato que checkout e teste de carga procuram", () => {
    expect(shippingOptionDataId(2)).toBe("melhorenvio-2")
    expect(shippingOptionDataId("17")).toBe("melhorenvio-17")
    for (const id of Object.keys(SERVICES)) expect(shippingOptionDataId(id)).toMatch(/^melhorenvio-\d+$/)
  })
})

describe("serviços de frete por ambiente", () => {
  it("produção oferece só Correios; o sandbox soma a Jadlog, a única que a conta de teste cota", () => {
    expect(Object.keys(servicesFor("production"))).toEqual(["1", "2", "17"])
    expect(Object.keys(servicesFor(undefined))).toEqual(["1", "2", "17"])
    expect(Object.keys(servicesFor("sandbox"))).toEqual(["1", "2", "17", "3", "4"])
  })
})
