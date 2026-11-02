import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export async function loadOrderOwner(scope: MedusaContainer, orderId: string) {
  const { data } = await scope
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({ entity: "order", fields: ["id", "display_id", "customer_id", "metadata"], filters: { id: orderId } })
  return data[0] as any as { id: string; display_id: number; customer_id: string | null; metadata: Record<string, unknown> | null } | undefined
}
