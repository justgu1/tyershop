import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useRef, useState } from "react"
import { adminFetch, ui } from "../lib/api"

type Invoice = { file_id: string; number: string | null; filename: string; issued_at: string }

const InvoiceWidget = ({ data }: { data: { id: string; display_id?: number; metadata?: Record<string, any> | null } }) => {
  const [invoice, setInvoice] = useState<Invoice | null>((data.metadata?.invoice as Invoice) ?? null)
  const [number, setNumber] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  async function send() {
    const file = fileRef.current?.files?.[0]
    if (!file) return setMessage("Escolha o PDF da nota fiscal.")
    setBusy(true)
    setMessage("")
    try {
      const form = new FormData()
      form.append("files", file)
      const up = await fetch("/admin/uploads", { method: "POST", body: form, credentials: "include" })
      const uploaded = await up.json().catch(() => ({}))
      const stored = uploaded?.files?.[0]
      if (!up.ok || !stored?.id) throw new Error(uploaded?.message || "Não foi possível enviar o arquivo.")
      const r = await adminFetch<{ invoice: Invoice }>(`/admin/orders/${data.id}/invoice`, {
        method: "POST",
        body: JSON.stringify({ file_id: stored.id, filename: file.name, number }),
      })
      setInvoice(r.invoice)
      setNumber("")
      if (fileRef.current) fileRef.current.value = ""
      setMessage("Nota fiscal anexada e enviada por e-mail ao cliente.")
    } catch (e: any) {
      setMessage(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm("Remover a nota fiscal deste pedido? O cliente deixa de vê-la em Meus pedidos.")) return
    setBusy(true)
    try {
      await adminFetch(`/admin/orders/${data.id}/invoice`, { method: "DELETE" })
      setInvoice(null)
      setMessage("")
    } catch (e: any) {
      setMessage(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff" }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Nota fiscal</h2>
      {invoice && (
        <p style={{ fontSize: 14, margin: "0 0 12px" }}>
          Anexada{invoice.number ? ` (nº ${invoice.number})` : ""} em {new Date(invoice.issued_at).toLocaleString("pt-BR")}.{" "}
          <button type="button" onClick={remove} disabled={busy} style={{ color: "#b91c1c", background: "none", border: 0, cursor: "pointer", padding: 0 }}>
            Remover
          </button>
        </p>
      )}
      <label style={{ fontSize: 13 }}>
        {invoice ? "Substituir por outro PDF" : "PDF da nota fiscal"}
        <input ref={fileRef} type="file" accept="application/pdf" style={ui.input} />
      </label>
      <label style={{ fontSize: 13 }}>
        Número da nota (opcional)
        <input value={number} onChange={(e) => setNumber(e.target.value)} maxLength={40} style={ui.input} />
      </label>
      <button type="button" onClick={send} disabled={busy} style={{ padding: "8px 14px", borderRadius: 6, border: 0, background: "#111827", color: "#fff", cursor: "pointer" }}>
        {busy ? "Enviando..." : "Anexar e enviar ao cliente"}
      </button>
      {message && <p style={{ fontSize: 13, marginTop: 10 }}>{message}</p>}
    </div>
  )
}

export const config = defineWidgetConfig({ zone: "order.details.side.after" })

export default InvoiceWidget
