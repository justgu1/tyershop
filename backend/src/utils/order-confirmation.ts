import { MedusaContainer } from "@medusajs/framework/types"
import { confirmationData, loadOrder, sendOrderEmail } from "./order-email"
import { claimConfirmation, setMetadataKey } from "./order-metadata"

/**
 * Envia a confirmação do pedido uma única vez. Só quem reserva envia; a reserva expira em 10 minutos, então uma falha ou um
 * processo que caiu no meio é refeito pelo job de reenvio. Devolve se o e-mail saiu.
 */
export async function deliverConfirmation(scope: MedusaContainer, orderId: string): Promise<boolean> {
  const order = await loadOrder(scope, orderId)
  if (!order?.email) return true
  if (!(await claimConfirmation(scope, orderId))) return true
  const sent = await sendOrderEmail(scope, order.email, "order_confirmation", await confirmationData(scope, order))
  if (sent) await setMetadataKey(scope, orderId, "confirmation_sent_at", new Date().toISOString())
  return sent
}
