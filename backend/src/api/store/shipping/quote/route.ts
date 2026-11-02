import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { buildPackage, loadShipments, productionDays, quotePackage } from "../../../../modules/melhor-envio/quote"
import { StoreQuoteBody } from "./validators"

/** Opções de frete (preço e prazo) para um CEP e uma lista de variantes: usado na página do produto, no carrinho e no checkout. */
export async function POST(req: MedusaRequest<StoreQuoteBody>, res: MedusaResponse) {
  const { postal_code, items } = req.validatedBody
  const shipments = await loadShipments(req.scope, items)
  const [quotes, production] = await Promise.all([
    quotePackage(req.scope, postal_code, buildPackage(shipments)),
    productionDays(req.scope, items.map((i) => i.variant_id)),
  ])
  res.json({ options: quotes, production_days: production })
}
