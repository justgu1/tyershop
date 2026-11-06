import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { requestSync } from "../modules/sales-sheet/sync"

export default async function salesSheetHandler({ container }: SubscriberArgs<{ id: string }>) {
  requestSync(container)
}

export const config: SubscriberConfig = {
  event: ["order.placed", "order.canceled", "order.updated", "order.completed", "payment.refunded", "payment.captured"],
}
