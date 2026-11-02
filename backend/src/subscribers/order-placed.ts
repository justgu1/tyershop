import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { deliverConfirmation } from "../utils/order-confirmation"

export default async function orderPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  // Se não sair agora, o job `resend-confirmations` tenta de novo.
  if (!(await deliverConfirmation(container, data.id))) {
    container.resolve("logger").warn(`Confirmação do pedido ${data.id} não enviada; o reenvio tenta depois`)
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
