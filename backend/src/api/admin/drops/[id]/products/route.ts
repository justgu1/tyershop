import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getDropProductIds, setDropProducts } from "../../../../../modules/drop/products"
import { SetDropProductsBody } from "./validators"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({ product_ids: await getDropProductIds(req.scope, req.params.id) })
}

export async function POST(req: MedusaRequest<SetDropProductsBody>, res: MedusaResponse) {
  const ids = await setDropProducts(req.scope, req.params.id, req.validatedBody.product_ids)
  res.json({ product_ids: ids })
}
