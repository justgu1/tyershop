import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MELHOR_ENVIO_MODULE } from "../../../../../../modules/melhor-envio"
import { printLabelUrl } from "../../../../../../modules/melhor-envio/client"
import { loadOrder } from "../../../../../../utils/order-email"
import type MelhorEnvioModuleService from "../../../../../../modules/melhor-envio/service"

/** Endereço do PDF da etiqueta já comprada, para imprimir e colar na embalagem. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const order = await loadOrder(req.scope, req.params.id)
  const meId = order?.metadata?.melhor_envio?.me_order_id
  if (!meId) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Este pedido ainda não tem etiqueta comprada.")
  const token = await req.scope.resolve<MelhorEnvioModuleService>(MELHOR_ENVIO_MODULE).accessToken()
  if (!token) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "O Melhor Envio não está conectado. Conecte de novo no admin.")
  res.json({ url: await printLabelUrl(token, meId) })
}
