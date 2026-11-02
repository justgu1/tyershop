import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { loadOrderOwner } from "../../../../../utils/order-owner"

/** Baixa a nota fiscal do pedido. Só a conta dona do pedido acessa; o arquivo nunca é público. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  const order = await loadOrderOwner(req.scope, req.params.id)
  const invoice = (order?.metadata as any)?.invoice
  // Mesma resposta para "não existe" e "é de outra pessoa": não revela pedidos alheios.
  if (!customerId || !order || order.customer_id !== customerId || !invoice?.file_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Nota fiscal não encontrada.")
  }
  const buffer = await req.scope.resolve(Modules.FILE).getAsBuffer(invoice.file_id)
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `attachment; filename="nota-fiscal-pedido-${order.display_id}.pdf"`)
  res.setHeader("Cache-Control", "private, no-store")
  res.send(buffer)
}
