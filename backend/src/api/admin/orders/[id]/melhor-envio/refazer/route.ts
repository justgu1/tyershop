import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { BusyError, purchaseLabel } from "../../../../../../modules/melhor-envio/purchase"

/** Compra outra etiqueta quando o Melhor Envio declara a anterior cancelada ou expirada; com a etiqueta ativa, recusa. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  try {
    res.json({ melhor_envio: await purchaseLabel(req.scope, req.params.id, "manual", { redo: true }) })
  } catch (err) {
    if (err instanceof BusyError) throw new MedusaError(MedusaError.Types.CONFLICT, err.message)
    throw err
  }
}
