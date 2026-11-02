import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { purchaseLabel } from "../../../../../modules/melhor-envio/purchase"

/** Compra a etiqueta deste pedido agora (também serve para tentar de novo depois de um erro). Independe da compra automática. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const state = await purchaseLabel(req.scope, req.params.id)
  res.json({ melhor_envio: state })
}
