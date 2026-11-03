import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useCallback, useEffect, useState } from "react"
import { adminFetch, ui } from "../../lib/api"

type Item = {
  cart_id: string
  email: string | null
  created_at: string
  mp_payment_id: number
  method: string | null
  amount: number | null
  status: string
  status_detail: string | null
  expires_at: string | null
}

const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Aguardando pagamento", color: "#b45309" },
  in_process: { label: "Em análise", color: "#b45309" },
  approved: { label: "Pago (a conciliação cria o pedido)", color: "#15803d" },
  authorized: { label: "Autorizado", color: "#15803d" },
  cancelled: { label: "Vencido ou cancelado", color: "#6b7280" },
  rejected: { label: "Recusado", color: "#b91c1c" },
  desconhecido: { label: "Sem resposta do Mercado Pago", color: "#6b7280" },
}

const brl = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—")

const PagamentosPage = () => {
  const [items, setItems] = useState<Item[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await adminFetch<{ items: Item[] }>("/admin/pagamentos-pendentes")
      setItems(d.items)
      setError("")
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Pagamentos pendentes</h1>
      <p style={{ color: "#6b7280", marginBottom: 16, maxWidth: 720 }}>
        Tentativas de pagamento dos últimos 7 dias que ainda não viraram pedido: Pix aguardando, vencido ou recusado. Quando o Mercado Pago aprova, o pedido é criado
        em até 5 minutos e some desta lista.
      </p>
      <button style={ui.button} onClick={load} disabled={loading}>
        {loading ? "Atualizando…" : "Atualizar"}
      </button>
      {error && <p style={{ color: "#b91c1c", marginTop: 12 }}>{error}</p>}
      <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
            <th>E-mail</th>
            <th>Valor</th>
            <th>Situação</th>
            <th>Criado</th>
            <th>Expira</th>
            <th>Mercado Pago</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const s = STATUS[i.status] ?? { label: i.status, color: "#6b7280" }
            return (
              <tr key={i.cart_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "8px 0" }}>{i.email ?? "—"}</td>
                <td>{brl(i.amount)}</td>
                <td style={{ color: s.color, fontWeight: 600 }}>{s.label}</td>
                <td>{when(i.created_at)}</td>
                <td>{when(i.expires_at)}</td>
                <td>#{i.mp_payment_id}</td>
              </tr>
            )
          })}
          {!items.length && !loading && (
            <tr>
              <td colSpan={6} style={{ padding: 16, color: "#6b7280" }}>
                Nada pendente.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export const config = defineRouteConfig({ label: "Pagamentos pendentes" })

export default PagamentosPage
