import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useState } from "react"
import { adminFetch } from "../lib/api"

type Payment = { method: string; status: string | null; id: string | null }

const PaymentWidget = ({ data }: { data: { id: string } }) => {
  const [payment, setPayment] = useState<Payment | null | undefined>(undefined)

  useEffect(() => {
    adminFetch<{ payment: Payment | null }>(`/admin/orders/${data.id}/pagamento`)
      .then((r) => setPayment(r.payment))
      .catch(() => setPayment(null))
  }, [data.id])

  return (
    <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Forma de pagamento</h2>
      {payment === undefined ? (
        <p style={{ fontSize: 14, margin: 0, color: "#6b7280" }}>Carregando…</p>
      ) : payment ? (
        <p style={{ fontSize: 14, margin: 0 }}>
          {payment.method}
          {payment.status ? ` (${payment.status})` : ""}
          {payment.id ? ` — Mercado Pago nº ${payment.id}` : ""}
        </p>
      ) : (
        <p style={{ fontSize: 14, margin: 0, color: "#6b7280" }}>Sem pagamento registrado neste pedido.</p>
      )}
    </div>
  )
}

export const config = defineWidgetConfig({ zone: "order.details.side.after" })

export default PaymentWidget
