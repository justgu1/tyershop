import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"

const WAIT_MS = 25_000
const POLL_MS = 200
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Erros em que o carrinho segue válido e o cliente pode tentar de novo (mesma regra da rota original do Medusa). */
const RETRYABLE = [MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR, MedusaError.Types.PAYMENT_REQUIRES_MORE_ERROR]

/**
 * Conclui o pedido da conta logada. Substitui `POST /store/carts/:id/complete` no checkout: com várias compras ao mesmo tempo
 * a rota original responde 409 ("já está sendo concluído") enquanto o fluxo ainda roda em segundo plano e o pedido acaba
 * criado e cobrado. Aqui, se o fluxo não terminou na resposta, esperamos o pedido aparecer em vez de mandar um erro ao cliente.
 */
export async function POST(req: AuthenticatedMedusaRequest<{ cart_id?: string }>, res: MedusaResponse) {
  const cartId = String(req.body?.cart_id ?? "")
  const customerId = req.auth_context?.actor_id
  if (!cartId || !customerId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Entre na sua conta para concluir a compra.")

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({ entity: "cart", fields: ["id", "customer_id"], filters: { id: cartId } })
  if (!carts[0] || carts[0].customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Este carrinho não pertence à sua conta.")
  }

  const { errors, transaction } = await completeCartWorkflow(req.scope).run({ input: { id: cartId }, throwOnError: false })

  const orderOf = async () => {
    const { data } = await query.graph({ entity: "order_cart", fields: ["order_id"], filters: { cart_id: cartId } })
    return (data[0] as { order_id?: string } | undefined)?.order_id ?? null
  }

  const failure = errors?.[0]?.error
  if (failure) {
    if (!RETRYABLE.includes(failure.type)) throw failure
    return res.status(200).json({ type: "cart", error: { message: failure.message, name: failure.name, type: failure.type } })
  }

  let orderId = await orderOf()
  const deadline = Date.now() + WAIT_MS
  while (!orderId && !transaction.hasFinished() && Date.now() < deadline) {
    await sleep(POLL_MS)
    orderId = await orderOf()
  }
  if (!orderId) {
    throw new MedusaError(MedusaError.Types.CONFLICT, "O pedido ainda está sendo concluído. Tente de novo em instantes.")
  }

  const { data: orders } = await query.graph({ entity: "order", fields: ["id", "display_id", "status", "total", "currency_code"], filters: { id: orderId } })
  res.status(200).json({ type: "order", order: orders[0] })
}
