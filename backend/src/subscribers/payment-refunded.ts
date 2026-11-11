import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { orderOfPayment, refundEmailData, sendOrderEmail } from "../utils/order-email"
import { shouldEmailRefund } from "../utils/refund-email"

export default async function paymentRefundedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const order = await orderOfPayment(container, data.id)
  if (!order?.email || !shouldEmailRefund(order.status)) return
  await sendOrderEmail(container, order.email, "order_refunded", await refundEmailData(container, order))
}

export const config: SubscriberConfig = { event: "payment.refunded" }
