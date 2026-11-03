import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { paymentInfo } from "../../../../../utils/order-email"

/** Forma, situação e número do pagamento do pedido no Mercado Pago, para o admin ver na tela do pedido. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.json({ payment: await paymentInfo(req.scope, req.params.id) })
}
