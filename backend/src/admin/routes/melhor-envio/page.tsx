import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useCallback, useEffect, useState } from "react"
import { adminFetch, ui } from "../../lib/api"

type Status = {
  connected: boolean
  expires_at: string | null
  configured: boolean
  environment: "sandbox" | "production"
  authorize_url: string | null
}

type Pending = { id: string; display_id: number; email: string | null; created_at: string; shipping: string | null; label_status: string | null; error: string | null }

const LABEL_STATUS: Record<string, string> = { carrinho: "No carrinho do Melhor Envio", erro: "Erro" }

const Labels = () => {
  const [auto, setAuto] = useState(false)
  const [orders, setOrders] = useState<Pending[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    try {
      const d = await adminFetch<{ auto: boolean; orders: Pending[] }>("/admin/melhor-envio/etiquetas")
      setAuto(d.auto)
      setOrders(d.orders)
      setPicked(new Set())
    } catch (e: any) {
      setMessage(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggleAuto = async () => {
    setBusy(true)
    try {
      const d = await adminFetch<{ auto: boolean }>("/admin/melhor-envio/etiquetas", { method: "POST", body: JSON.stringify({ auto: !auto }) })
      setAuto(d.auto)
      setMessage(d.auto ? "Compra automática ligada: pedidos novos compram a etiqueta sozinhos." : "Compra automática desligada: compre pelas etiquetas abaixo.")
    } catch (e: any) {
      setMessage(e.message)
    } finally {
      setBusy(false)
    }
  }

  const buy = async (ids: string[]) => {
    if (!ids.length) return
    setBusy(true)
    setMessage(`Comprando ${ids.length} etiqueta(s)… pode levar alguns segundos por pedido.`)
    try {
      const done: { id: string; status: string; error?: string }[] = []
      for (let i = 0; i < ids.length; i += 30) {
        const d = await adminFetch<{ results: typeof done }>("/admin/melhor-envio/etiquetas", { method: "POST", body: JSON.stringify({ order_ids: ids.slice(i, i + 30) }) })
        done.push(...d.results)
      }
      const failed = done.filter((r) => r.status === "erro")
      setMessage(`${done.length - failed.length} comprada(s), ${failed.length} com erro${failed.length ? ": " + failed.map((f) => f.error).join(" | ") : "."}`)
    } catch (e: any) {
      setMessage(e.message)
    } finally {
      setBusy(false)
      load()
    }
  }

  const allPicked = orders.length > 0 && picked.size === orders.length
  return (
    <div style={{ marginTop: 32 }}>
      <h2 className="text-lg font-semibold mb-2">Etiquetas</h2>
      <p style={{ marginBottom: 12 }}>
        Compra das etiquetas: <strong>{auto ? "automática" : "manual"}</strong>{" "}
        <button style={ui.button} onClick={toggleAuto} disabled={busy}>
          {auto ? "Mudar para manual" : "Mudar para automática"}
        </button>
      </p>
      {message && <p style={{ marginBottom: 12 }}>{message}</p>}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button style={ui.button} onClick={() => buy([...picked])} disabled={busy || picked.size === 0}>
          Comprar selecionadas ({picked.size})
        </button>
        <button style={ui.button} onClick={() => buy(orders.map((o) => o.id))} disabled={busy || orders.length === 0}>
          Comprar todas ({orders.length})
        </button>
      </div>
      {orders.length === 0 ? (
        <p style={{ color: "#6b7280" }}>Nenhum pedido pago aguardando etiqueta.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
              <th>
                <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(orders.map((o) => o.id)))} aria-label="Selecionar todos" />
              </th>
              <th>Pedido</th>
              <th>E-mail</th>
              <th>Entrega</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td>
                  <input
                    type="checkbox"
                    checked={picked.has(o.id)}
                    onChange={() => setPicked((prev) => { const n = new Set(prev); n.has(o.id) ? n.delete(o.id) : n.add(o.id); return n })}
                    aria-label={`Selecionar pedido ${o.display_id}`}
                  />
                </td>
                <td>#{o.display_id}</td>
                <td>{o.email ?? "—"}</td>
                <td>{o.shipping ?? "—"}</td>
                <td style={{ color: o.label_status === "erro" ? "#b91c1c" : undefined }}>
                  {o.label_status ? LABEL_STATUS[o.label_status] ?? o.label_status : "Aguardando"}
                  {o.error ? ` — ${o.error}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const MelhorEnvioPage = () => {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    adminFetch<Status>("/admin/melhor-envio")
      .then(setStatus)
      .catch(() => setError("Não foi possível carregar o estado da conexão."))
  }, [])

  return (
    <div className="p-6" style={{ maxWidth: 900 }}>
      <h1 className="text-xl font-semibold mb-4">Melhor Envio</h1>
      {error && <p style={{ color: "#c0392b" }}>{error}</p>}
      {status && (
        <div className="flex flex-col gap-3">
          <p>
            Ambiente: <strong>{status.environment === "sandbox" ? "Sandbox (testes)" : "Produção"}</strong>
          </p>
          <p>
            Conexão:{" "}
            <strong>
              {status.connected
                ? `conectado (token válido até ${new Date(status.expires_at as string).toLocaleDateString("pt-BR")}, renova sozinho)`
                : "não conectado"}
            </strong>
          </p>
          {!status.configured && (
            <p style={{ color: "#c0392b" }}>
              Faltam as variáveis MELHOR_ENVIO_CLIENT_ID, MELHOR_ENVIO_CLIENT_SECRET e MELHOR_ENVIO_REDIRECT_URI no servidor.
            </p>
          )}
          {status.authorize_url && (
            <a href={status.authorize_url} target="_blank" rel="noreferrer" style={{ ...ui.button, display: "inline-block", textDecoration: "none", width: "fit-content" }}>
              {status.connected ? "Reconectar" : "Conectar ao Melhor Envio"}
            </a>
          )}
        </div>
      )}
      <Labels />
    </div>
  )
}

export const config = defineRouteConfig({ label: "Melhor Envio" })

export default MelhorEnvioPage
