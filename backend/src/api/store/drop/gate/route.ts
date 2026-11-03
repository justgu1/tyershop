import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { blockedProductIds, presaleProductIds, MAX_PER_PRODUCT_PRESALE } from "../../../../modules/drop/access"

/** Diz quais variantes não podem ficar na bag: peças de drop fora de venda ou em pré-venda sem ingresso. */
export async function POST(req: AuthenticatedMedusaRequest<{ variant_ids: string[] }>, res: MedusaResponse) {
  const variantIds = (req.body?.variant_ids ?? []).filter((id) => typeof id === "string").slice(0, 100)
  if (!variantIds.length) return res.json({ blocked_variant_ids: [], presale_limit: null })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "product_id"],
    filters: { id: variantIds },
  })
  const blockedProducts = await blockedProductIds(req.scope, req.auth_context?.actor_id)

  const presale = await presaleProductIds(req.scope)
  const limited: Record<string, string> = {}
  for (const v of variants as any[]) if (presale.has(v.product_id)) limited[v.id] = v.product_id

  res.json({
    blocked_variant_ids: (variants as any[]).filter((v) => blockedProducts.has(v.product_id)).map((v) => v.id),
    presale_limit: { max_per_product: MAX_PER_PRODUCT_PRESALE, product_by_variant: limited },
  })
}
