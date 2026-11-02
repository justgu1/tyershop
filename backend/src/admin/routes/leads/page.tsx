import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useCallback, useEffect, useState } from "react"
import { adminFetch, ui } from "../../lib/api"

type Lead = {
  id: string
  email: string
  name: string | null
  status: "pendente" | "liberado" | "inativo" | "negado" | "descadastrado"
  source: string
  created_at: string
}

const STATUSES: Lead["status"][] = ["pendente", "liberado", "inativo", "negado", "descadastrado"]

const LeadsPage = () => {
  const [leads, setLeads] = useState<Lead[]>([])
  const [count, setCount] = useState(0)
  const [status, setStatus] = useState("")
  const [q, setQ] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "200" })
      if (status) params.set("status", status)
      if (q) params.set("q", q)
      const d = await adminFetch<{ leads: Lead[]; count: number }>(`/admin/leads?${params}`)
      setLeads(d.leads)
      setCount(d.count)
      setError("")
    } catch (e: any) {
      setError(e.message)
    }
  }, [status, q])

  useEffect(() => {
    load()
  }, [load])

  async function setLeadStatus(id: string, next: Lead["status"]) {
    await adminFetch(`/admin/leads/${id}`, { method: "POST", body: JSON.stringify({ status: next }) })
    await load()
  }

  async function add() {
    if (!newEmail) return
    try {
      await adminFetch("/admin/leads", { method: "POST", body: JSON.stringify({ email: newEmail }) })
      setNewEmail("")
      await load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Excluir este lead?")) return
    await adminFetch(`/admin/leads/${id}`, { method: "DELETE" })
    await load()
  }

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Leads</h1>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 16px" }}>
        Liberados recebem convite em todo drop. Pendentes entram pelo link do drop ou quando liberados aqui.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <select style={{ ...ui.input, width: 160, margin: 0 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          style={{ ...ui.input, width: 220, margin: 0 }}
          placeholder="Buscar e-mail"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          style={{ ...ui.input, width: 240, margin: 0, marginLeft: "auto" }}
          placeholder="novo@email.com (entra liberado)"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
        <button style={ui.button} onClick={add}>
          Adicionar
        </button>
      </div>

      {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
      <p style={{ fontSize: 13, color: "#6b7280" }}>{count} lead(s)</p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
            <th style={{ padding: 8 }}>E-mail</th>
            <th>Origem</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: 8 }}>
                {l.email}
                {l.name ? <span style={{ color: "#6b7280" }}> · {l.name}</span> : null}
              </td>
              <td>{l.source}</td>
              <td>
                <select value={l.status} onChange={(e) => setLeadStatus(l.id, e.target.value as Lead["status"])}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </td>
              <td style={{ textAlign: "right" }}>
                <button style={ui.ghost} onClick={() => remove(l.id)}>
                  Excluir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const config = defineRouteConfig({ label: "Leads" })

export default LeadsPage
