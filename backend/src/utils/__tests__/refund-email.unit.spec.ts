import { shouldEmailRefund, sumRefunds, toAmount } from "../refund-email"

describe("e-mail de estorno", () => {
  it("estorno de pedido cancelado não manda segundo e-mail", () => {
    expect(shouldEmailRefund("canceled")).toBe(false)
    expect(shouldEmailRefund("pending")).toBe(true)
    expect(shouldEmailRefund(undefined)).toBe(true)
  })

  it("soma os estornos mesmo com valor em texto ou BigNumber", () => {
    expect(sumRefunds([{ amount: "39.84" }, { amount: { value: "29.9" } }, { amount: { numeric: 10 } }, {}])).toBe(79.74)
    expect(sumRefunds([])).toBe(0)
    expect(toAmount(null)).toBe(0)
  })
})
