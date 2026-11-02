import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { BusyError, purchaseLabel } from "../../../../../modules/melhor-envio/purchase"

/** Compra a etiqueta deste pedido agora (também serve para tentar de novo depois de um erro). Independe da compra automática. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    res.json({ melhor_envio: await purchaseLabel(req.scope, req.params.id) })
  } catch (err) {
    if (err instanceof BusyError) throw new MedusaError(MedusaError.Types.CONFLICT, err.message)
    throw err
  }
}
