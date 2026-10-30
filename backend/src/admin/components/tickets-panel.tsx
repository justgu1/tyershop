import { useCallback, useEffect, useState } from "react"
import { adminFetch, ui } from "../lib/api"

type Preview = {
  phase: string
  eligible: { id: string; email: string; name: string | null }[]
  tickets: { id: string; code: string; source: string; sent_at: string | null; email: string | null }[]
  unsent: number
}

type Result = { created: number; sent: number; failed: { email: string; error: string }[] }

export function TicketsPanel({ dropId, title, onClose }: { dropId: string; title: string; onClose: () => void }) {
  const [data, setData] = useState<Preview | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    try {
      setData(await adminFetch<Preview>(`/admin/drops/${dropId}/tickets`))
    } catch (e: any) {
      setError(e.message)
    }
  }, [dropId])

  useEffect(() => {
    load()
  }, [load])

  async function issue() {
    if (!data) return
    const total = data.eligible.length + data.unsent
    if (!window.confirm(`Emitir ingressos e enviar ${total} e-mail(s) do drop "${title}"?`)) return
    setBusy(true)
    setError("")
    try {
      setResult(await adminFetch<Result>(`/admin/drops/${dropId}/tickets`, { method: "POST", body: "{}" }))
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const total = data ? data.eligible.length + data.unsent : 0

  return (
    <div style={ui.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Ingressos · {title}</h2>
        <button style={ui.ghost} onClick={onClose}>
          Fechar
        </button>
      </div>
      {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
      {!data && !error && <p>Carregando...</p>}
      {data && (
        <>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "8px 0" }}>
            Prévia: {data.eligible.length} liberado(s) sem ingresso e {data.unsent} ingresso(s) criado(s) com e-mail pendente.
            Inativos, pendentes e negados não recebem.
          </p>
          {data.eligible.length > 0 && (
            <ul style={{ fontSize: 13, margin: "0 0 12px", paddingLeft: 18 }}>
              {data.eligible.map((l) => (
                <li key={l.id}>{l.email}</li>
              ))}
            </ul>
          )}
          <button
            style={{ ...ui.button, opacity: busy || !total ? 0.5 : 1 }}
            disabled={busy || !total}
            onClick={issue}
          >
            {busy ? "Enviando..." : `Emitir e enviar (${total})`}
          </button>
          {result && (
            <p style={{ fontSize: 13, marginTop: 12 }}>
              {result.created} ingresso(s) criado(s), {result.sent} e-mail(s) enviado(s)
              {result.failed.length ? `, ${result.failed.length} falha(s): ${result.failed.map((f) => `${f.email} (${f.error})`).join("; ")}` : ""}.
            </p>
          )}
          {data.tickets.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 16 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: 6 }}>E-mail</th>
                  <th>Origem</th>
                  <th>E-mail enviado</th>
                </tr>
              </thead>
              <tbody>
                {data.tickets.map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: 6 }}>{t.email}</td>
                    <td>{t.source}</td>
                    <td>{t.sent_at ? new Date(t.sent_at).toLocaleString("pt-BR") : "pendente"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
