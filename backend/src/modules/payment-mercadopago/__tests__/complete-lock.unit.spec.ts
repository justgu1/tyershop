import { readFileSync } from "node:fs"
import { join } from "node:path"
import { completeCartLockKey } from "../complete-lock"

const read = (rel: string) => readFileSync(join(__dirname, "../../..", rel), "utf8")

describe("conclusão do carrinho", () => {
  it("uma execução por carrinho: a rota do checkout e a conciliação usam a mesma trava", () => {
    expect(completeCartLockKey("cart_1")).toBe("complete-cart:cart_1")
    expect(read("api/store/checkout/complete/route.ts")).toContain("completeCartLockKey(cartId)")
    expect(read("modules/payment-mercadopago/reconcile.ts")).toContain("completeCartLockKey(cart.id)")
  })
})
