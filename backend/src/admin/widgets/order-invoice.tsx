import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useRef, useState } from "react"
import { adminFetch, ui } from "../lib/api"

type Label = { status: string; tracking_code?: string | null; error?: string }
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
      // A nota tem nome, CPF e endereço do cliente: nunca pública.
      form.append("access", "private")
      const up = await fetch("/admin/uploads", { method: "POST", body: form, credentials: "include" })
      const uploaded = await up.json().catch(() => ({}))
      const stored = uploaded?.files?.[0]
      if (!up.ok || !stored?.id) throw new Error(uploaded?.message || "Não foi possível enviar o arquivo.")
      const r = await adminFetch<{ invoice: Invoice; emailed: boolean }>(`/admin/orders/${data.id}/invoice`, {
        method: "POST",
        body: JSON.stringify({ file_id: stored.id, filename: file.name, number }),
      })
      setInvoice(r.invoice)
      setNumber("")
      if (fileRef.current) fileRef.current.value = ""
      setMessage(r.emailed ? "Nota fiscal anexada e enviada por e-mail ao cliente." : "Nota fiscal anexada, mas o e-mail não saiu. Envie o mesmo arquivo de novo para tentar outra vez.")
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

  const [label, setLabel] = useState<Label | null>((data.metadata?.melhor_envio as Label) ?? null)
  const [labelBusy, setLabelBusy] = useState(false)

  async function buyLabel() {
    setLabelBusy(true)
    try {
      const r = await adminFetch<{ melhor_envio: Label }>(`/admin/orders/${data.id}/melhor-envio`, { method: "POST" })
      setLabel(r.melhor_envio)
    } catch (e: any) {
      setLabel({ status: "erro", error: e.message })
    } finally {
      setLabelBusy(false)
    }
  }

  async function redoLabel() {
    if (!window.confirm("Compra outra etiqueta (cobra do saldo do Melhor Envio). Só funciona se o Melhor Envio mostrar a etiqueta atual como cancelada ou expirada. Continuar?")) return
    setLabelBusy(true)
    try {
      const r = await adminFetch<{ melhor_envio: Label }>(`/admin/orders/${data.id}/melhor-envio/refazer`, { method: "POST" })
      setLabel(r.melhor_envio)
    } catch (e: any) {
      setLabel((prev) => ({ ...(prev as Label), error: e.message }))
    } finally {
      setLabelBusy(false)
    }
  }

  async function printLabel() {
    setLabelBusy(true)
    try {
      const r = await adminFetch<{ url: string }>(`/admin/orders/${data.id}/melhor-envio/imprimir`)
      window.open(r.url, "_blank", "noopener")
    } catch (e: any) {
      setLabel((prev) => ({ ...(prev as Label), error: e.message }))
    } finally {
      setLabelBusy(false)
    }
  }

  const labelText: Record<string, string> = {
    carrinho: "No carrinho do Melhor Envio",
    gerada: "Etiqueta comprada, aguardando a postagem",
    postada: "Postada, a caminho",
    entregue: "Entregue",
    erro: "Erro ao comprar a etiqueta",
  }

  return (
    <>
    <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", marginBottom: 12 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Etiqueta de envio</h2>
      {label && (
        <p style={{ fontSize: 14, margin: "0 0 12px" }}>
          {labelText[label.status] ?? label.status}
          {label.tracking_code ? ` — rastreio ${label.tracking_code}` : ""}
          {label.error ? <span style={{ display: "block", color: "#b91c1c", marginTop: 4 }}>{label.error}</span> : null}
        </p>
      )}
      {label && (label.status === "gerada" || label.status === "postada") && (
        <button type="button" onClick={printLabel} disabled={labelBusy} style={{ padding: "8px 14px", borderRadius: 6, border: 0, background: "#e77e23", color: "#fff", cursor: "pointer" }}>
          {labelBusy ? "Abrindo..." : "Imprimir etiqueta"}
        </button>
      )}
      {label && (label.status === "gerada" || label.status === "postada") && (
        <button type="button" onClick={redoLabel} disabled={labelBusy} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#111827", cursor: "pointer", marginLeft: 8 }}>
          Refazer etiqueta
        </button>
      )}
      {(!label || label.status === "erro" || label.status === "carrinho") && (
        <button type="button" onClick={buyLabel} disabled={labelBusy} style={{ padding: "8px 14px", borderRadius: 6, border: 0, background: "#e77e23", color: "#fff", cursor: "pointer" }}>
          {labelBusy ? "Comprando..." : label ? "Retomar a compra da etiqueta" : "Comprar etiqueta no Melhor Envio"}
        </button>
      )}
    </div>
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
    </>
  )
}

export const config = defineWidgetConfig({ zone: "order.details.side.after" })

export default InvoiceWidget
