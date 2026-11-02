import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { confirmationData, loadOrder } from "../../../../../utils/order-email"

/** Dados do comprovante do pedido (itens, valores, entrega e pagamento). Só a conta dona do pedido acessa. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  const order = await loadOrder(req.scope, req.params.id)
  // Mesma resposta para "não existe" e "é de outra pessoa": não revela pedidos alheios.
  if (!customerId || !order || order.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Pedido não encontrado.")
  }
  const { orders_url, production_days, ...receipt } = await confirmationData(req.scope, order)
  res.setHeader("Cache-Control", "private, no-store")
  res.json({ receipt })
}
