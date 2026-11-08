import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useCallback, useEffect, useState } from "react"
import { adminFetch, ui } from "../../lib/api"

type EmailRow = {
  id: string
  to: string
  template: string
  status: string
  sent_at: string
  viewed: {
    first_viewed_at: string
    last_viewed_at: string
    view_count: number
    ip: string | null
    user_agent: string | null
    country: string | null
    city: string | null
  } | null
}

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
const place = (v: NonNullable<EmailRow["viewed"]>) => [v.city, v.country].filter(Boolean).join(", ") || "—"

const EmailsPage = () => {
  const [rows, setRows] = useState<EmailRow[]>([])
  const [count, setCount] = useState(0)
  const [q, setQ] = useState("")
  const [only, setOnly] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "200" })
      if (q) params.set("q", q)
      const d = await adminFetch<{ emails: EmailRow[]; count: number }>(`/admin/emails?${params}`)
      setRows(d.emails)
      setCount(d.count)
      setError("")
    } catch (e: any) {
      setError(e.message)
    }
  }, [q])

  useEffect(() => {
    load()
  }, [load])

  const shown = rows.filter((r) => (only === "viewed" ? r.viewed : only === "unseen" ? !r.viewed : true))

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>E-mails enviados</h1>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 16px" }}>
        "Visto" conta quem abriu o link "Abra no navegador" do e-mail. Quem lê só no aplicativo de e-mail aparece como não
        visto, e visualização por verificação automática de link pode aparecer como visto.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input style={{ ...ui.input, width: 240, margin: 0 }} placeholder="Buscar destinatário" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ ...ui.input, width: 160, margin: 0 }} value={only} onChange={(e) => setOnly(e.target.value)}>
          <option value="">Todos</option>
          <option value="viewed">Vistos</option>
          <option value="unseen">Não vistos</option>
        </select>
      </div>

      {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
      <p style={{ fontSize: 13, color: "#6b7280" }}>{shown.length} de {count} e-mail(s)</p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
            <th style={{ padding: 8 }}>Destinatário</th>
            <th>Tipo</th>
            <th>Enviado</th>
            <th>Envio</th>
            <th>Visto</th>
            <th>Onde</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: 8 }}>{r.to}</td>
              <td>{r.template}</td>
              <td>{fmt(r.sent_at)}</td>
              <td>{r.status === "success" ? "enviado" : r.status === "failure" ? "falhou" : r.status}</td>
              <td>{r.viewed ? `${fmt(r.viewed.first_viewed_at)} (${r.viewed.view_count}x)` : "—"}</td>
              <td title={r.viewed?.user_agent ?? ""}>{r.viewed ? place(r.viewed) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const config = defineRouteConfig({ label: "E-mails" })

export default EmailsPage
