import { addToCartWorkflow, completeCartWorkflow, updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows"
import { assertShippingCurrent } from "../../modules/melhor-envio/quote"
import { assertCartAllowed, linesFromVariants, loadCart } from "../../modules/drop/access"

/** Regras do drop valendo no servidor (acesso, limite por pessoa, lote): não dá para burlar pela API. */
addToCartWorkflow.hooks.validate(async ({ input, cart }, { container }) => {
  const current = await loadCart(container, (cart as any).id)
  const adding = await linesFromVariants(container, (input.items ?? []) as any)
  await assertCartAllowed(container, {
    customerId: current.customerId,
    lines: [...current.lines, ...adding],
    mode: "add",
  })
})

/** Aumentar a quantidade de uma linha já no carrinho passa pelas mesmas regras de adicionar. */
updateLineItemInCartWorkflow.hooks.validate(async ({ input }, { container }) => {
  const current = await loadCart(container, (input as any).cart_id)
  const quantity = (input as any).update?.quantity
  const lines = current.lines.map((l) => (l.item_id === (input as any).item_id && quantity != null ? { ...l, quantity: Number(quantity) } : l))
  await assertCartAllowed(container, { customerId: current.customerId, lines, mode: "add" })
})

completeCartWorkflow.hooks.validate(async ({ cart }, { container }) => {
  const current = await loadCart(container, (cart as any).id)
  await assertCartAllowed(container, { customerId: current.customerId, lines: current.lines, mode: "complete" })
  await assertShippingCurrent(container, (cart as any).id)
})
