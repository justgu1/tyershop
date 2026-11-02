import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { baseOrderData, loadOrder, sendOrderEmail } from "../../../../../utils/order-email"

type Body = { file_id?: string; filename?: string; number?: string }

async function currentMetadata(req: AuthenticatedMedusaRequest, orderId: string) {
  const order = await loadOrder(req.scope, orderId)
  if (!order) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Pedido não encontrado.")
  return { order, metadata: (order.metadata ?? {}) as Record<string, unknown> }
}

/**
 * Anexa a nota fiscal ao pedido: o PDF já foi enviado por /admin/uploads e aqui só se guarda a referência.
 * O cliente recebe a nota por e-mail (em anexo) e a baixa em Meus pedidos. Reenviar substitui a anterior.
 */
export async function POST(req: AuthenticatedMedusaRequest<Body>, res: MedusaResponse) {
  const fileId = String(req.body?.file_id ?? "").trim()
  if (!fileId) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Envie o arquivo da nota fiscal.")
  const number = String(req.body?.number ?? "").trim().slice(0, 40) || null

  const files = req.scope.resolve(Modules.FILE)
  let buffer: Buffer
  try {
    buffer = await files.getAsBuffer(fileId)
  } catch {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Arquivo da nota fiscal não encontrado.")
  }
  if (buffer.subarray(0, 4).toString() !== "%PDF") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "A nota fiscal precisa ser um arquivo PDF.")
  }

  const { order, metadata } = await currentMetadata(req, req.params.id)
  const invoice = { file_id: fileId, number, filename: String(req.body?.filename ?? "nota-fiscal.pdf").slice(0, 120), issued_at: new Date().toISOString() }
  await req.scope.resolve(Modules.ORDER).updateOrders(order.id, { metadata: { ...metadata, invoice } })

  if (order.email) {
    await sendOrderEmail(
      req.scope,
      order.email,
      "order_invoice",
      { ...baseOrderData(order), invoice_number: number },
      [{ content: buffer.toString("base64"), filename: `nota-fiscal-pedido-${order.display_id}.pdf`, content_type: "application/pdf" }]
    )
  }
  res.json({ invoice })
}

export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { order, metadata } = await currentMetadata(req, req.params.id)
  const { invoice: _removed, ...rest } = metadata
  await req.scope.resolve(Modules.ORDER).updateOrders(order.id, { metadata: rest })
  res.json({ invoice: null })
}
