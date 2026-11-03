import { shouldComplete } from "../reconcile-rules"

describe("shouldComplete", () => {
  it("só um pagamento aprovado vira pedido", () => {
    expect(shouldComplete("approved")).toBe(true)
    for (const s of ["pending", "in_process", "rejected", "cancelled", "refunded", "charged_back", undefined, null]) {
      expect(shouldComplete(s as any)).toBe(false)
    }
  })
})
