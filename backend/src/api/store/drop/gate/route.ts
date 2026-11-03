import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { blockedProductIds } from "../../../../modules/drop/access"

/** Diz quais variantes não podem ficar na bag: peças de drop fora de venda ou em pré-venda sem ingresso. */
export async function POST(req: AuthenticatedMedusaRequest<{ variant_ids: string[] }>, res: MedusaResponse) {
  const variantIds = (req.body?.variant_ids ?? []).filter((id) => typeof id === "string").slice(0, 100)
  if (!variantIds.length) return res.json({ blocked_variant_ids: [] })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "product_id"],
    filters: { id: variantIds },
  })
  const blockedProducts = await blockedProductIds(req.scope, req.auth_context?.actor_id)

  res.json({
    blocked_variant_ids: (variants as any[]).filter((v) => blockedProducts.has(v.product_id)).map((v) => v.id),
  })
}
