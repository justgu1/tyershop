import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"

const WAIT_MS = 25_000
const POLL_MS = 200
/** Se o fluxo já terminou e o pedido ainda não apareceu, não há por que esperar o prazo todo. */
const AFTER_FINISH_MS = 3_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Erros em que o carrinho segue válido e o cliente pode tentar de novo (mesma regra da rota original do Medusa). */
const RETRYABLE = [MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR, MedusaError.Types.PAYMENT_REQUIRES_MORE_ERROR]

const ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "email",
  "currency_code",
  "total",
  "subtotal",
  "shipping_total",
  "items.id",
  "items.title",
  "items.quantity",
  "items.unit_price",
]

/**
 * Conclui o pedido da conta logada. Substitui `POST /store/carts/:id/complete` no checkout: com várias compras ao mesmo tempo
 * a rota original responde 409 ("já está sendo concluído") enquanto o fluxo ainda roda em segundo plano e o pedido acaba
 * criado e cobrado. Aqui, se o fluxo não terminou na resposta, esperamos o pedido aparecer em vez de mandar um erro ao cliente.
 * Repetir a chamada (clique duplo, nova tentativa) devolve o mesmo pedido.
 */
export async function POST(req: AuthenticatedMedusaRequest<{ cart_id?: string }>, res: MedusaResponse) {
  const cartId = String(req.body?.cart_id ?? "").trim()
  if (!cartId) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Informe o carrinho a concluir.")

  const customerId = req.auth_context?.actor_id
  if (!customerId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Entre na sua conta para concluir a compra.")

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({ entity: "cart", fields: ["id", "customer_id"], filters: { id: cartId } })
  if (!carts[0]) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Carrinho não encontrado.")
  if (carts[0].customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Este carrinho não está ligado à sua conta.")
  }

  const orderOf = async () => {
    const { data } = await query.graph({ entity: "order_cart", fields: ["order_id"], filters: { cart_id: cartId } })
    return (data[0] as { order_id?: string } | undefined)?.order_id ?? null
  }
  const respondWithOrder = async (orderId: string) => {
    const { data } = await query.graph({ entity: "order", fields: ORDER_FIELDS, filters: { id: orderId } })
    return res.status(200).json({ type: "order", order: data[0] })
  }

  // Já concluído (repetição, clique duplo): devolve o pedido existente sem rodar o fluxo de novo.
  const existing = await orderOf()
  if (existing) return respondWithOrder(existing)

  const { errors, transaction } = await completeCartWorkflow(req.scope).run({ input: { id: cartId }, throwOnError: false })

  const failure = errors?.[0]?.error
  if (failure) {
    // Outra chamada para o mesmo carrinho pode ter criado o pedido enquanto esta esperava a trava.
    const created = await orderOf()
    if (created) return respondWithOrder(created)
    if (!RETRYABLE.includes(failure.type)) throw failure
    return res.status(200).json({ type: "cart", error: { message: failure.message, name: failure.name, type: failure.type } })
  }

  let deadline = Date.now() + WAIT_MS
  let finishedSeen = false
  let orderId = await orderOf()
  while (!orderId && Date.now() < deadline) {
    if (!finishedSeen && transaction.hasFinished()) {
      finishedSeen = true
      deadline = Math.min(deadline, Date.now() + AFTER_FINISH_MS)
    }
    await sleep(POLL_MS)
    orderId = await orderOf()
  }
  if (!orderId) {
    throw new MedusaError(MedusaError.Types.CONFLICT, "O pedido ainda está sendo concluído. Tente de novo em instantes.")
  }
  return respondWithOrder(orderId)
}
