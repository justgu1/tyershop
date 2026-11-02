import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { autoLabelEnabled, purchaseLabel } from "../modules/melhor-envio/purchase"
import { confirmationData, loadOrder, sendOrderEmail } from "../utils/order-email"

export default async function orderPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const order = await loadOrder(container, data.id)
  if (order?.email) await sendOrderEmail(container, order.email, "order_confirmation", await confirmationData(container, order))
  // Etiqueta automática (desligada por padrão). Erros ficam gravados no pedido e não afetam o e-mail acima.
  if (autoLabelEnabled()) await purchaseLabel(container, data.id).catch((err) => container.resolve("logger").error(`[melhor-envio] ${err.message}`))
}

export const config: SubscriberConfig = { event: "order.placed" }
