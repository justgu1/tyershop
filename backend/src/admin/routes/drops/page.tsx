import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useCallback, useEffect, useState } from "react"
import { ProductsPanel } from "../../components/products-panel"
import { TicketsPanel } from "../../components/tickets-panel"
import { adminFetch, fromLocalInput, toLocalInput, ui } from "../../lib/api"

type Drop = {
  id: string
  handle: string
  title: string
  subtitle: string | null
  is_current: boolean
  phase: "coming_soon" | "presale" | "general" | "ended"
  preorder_starts_at: string
  preorder_ends_at: string
  general_starts_at: string | null
  general_ends_at: string
  general_lot: number | null
  sell_until_sold_out?: boolean
  closed_at: string | null
  production_days: number
  release_leads_in_presale?: boolean
  component_key: string | null
  hero_kind: "community_video" | "drop_video" | "banner"
  hero_url: string | null
  cover_url: string | null
  instagram_url: string | null
  whatsapp_url: string | null
}

const PHASE_LABEL: Record<Drop["phase"], string> = {
  coming_soon: "Em breve",
  presale: "Pré-venda",
  general: "Venda geral",
  ended: "Encerrado",
}

const EMPTY: Partial<Drop> = {
  handle: "",
  title: "",
  subtitle: "",
  hero_kind: "banner",
  production_days: 21,
  general_lot: null,
}

const DropsPage = () => {
  const [drops, setDrops] = useState<Drop[]>([])
  const [editing, setEditing] = useState<Partial<Drop> | null>(null)
  const [ticketsFor, setTicketsFor] = useState<Drop | null>(null)
  const [productsFor, setProductsFor] = useState<Drop | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await adminFetch<{ drops: Drop[] }>("/admin/drops")
      setDrops(d.drops)
    } catch (e: any) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!editing) return
    setBusy(true)
    setError("")
    try {
      const { id, phase, ...body } = editing as any
      delete body.next_phase_at
      delete body.created_at
      delete body.updated_at
      delete body.deleted_at
      if (id) await adminFetch(`/admin/drops/${id}`, { method: "POST", body: JSON.stringify(body) })
      else await adminFetch("/admin/drops", { method: "POST", body: JSON.stringify(body) })
      setEditing(null)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function makeCurrent(id: string) {
    await adminFetch(`/admin/drops/${id}`, { method: "POST", body: JSON.stringify({ is_current: true }) })
    await load()
  }

  async function remove(id: string) {
    if (!window.confirm("Excluir este drop?")) return
    await adminFetch(`/admin/drops/${id}`, { method: "DELETE" })
    await load()
  }

  const set = (patch: Partial<Drop>) => setEditing({ ...editing, ...patch })
  const dateField = (label: string, key: keyof Drop) => (
    <div>
      <label style={ui.label}>{label}</label>
      <input
        style={ui.input}
        type="datetime-local"
        value={toLocalInput((editing as any)?.[key])}
        onChange={(e) => set({ [key]: fromLocalInput(e.target.value) } as any)}
      />
    </div>
  )
  const textField = (label: string, key: keyof Drop) => (
    <div>
      <label style={ui.label}>{label}</label>
      <input
        style={ui.input}
        value={((editing as any)?.[key] as string) ?? ""}
        onChange={(e) => set({ [key]: e.target.value || null } as any)}
      />
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Drops</h1>
        {!editing && (
          <button style={ui.button} onClick={() => setEditing({ ...EMPTY })}>
            Novo drop
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 20px" }}>
        A fase (em breve, pré-venda, venda geral, encerrado) é calculada pelas datas e pelo lote. Só um drop é o atual
        e aparece em /drop.
      </p>

      {error && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {editing && (
        <div style={ui.card}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            {editing.id ? "Editar drop" : "Novo drop"}
          </h2>
          {textField("Título", "title")}
          {textField("Subtítulo", "subtitle")}
          <label style={ui.label}>Handle (URL, minúsculas e hífen)</label>
          <input
            style={ui.input}
            value={editing.handle ?? ""}
            onChange={(e) => set({ handle: e.target.value })}
            disabled={!!editing.id}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            {dateField("Início da pré-venda", "preorder_starts_at")}
            {dateField("Fim da pré-venda", "preorder_ends_at")}
            {dateField("Início da venda geral (vazio = logo após a pré-venda)", "general_starts_at")}
            {dateField("Fim da venda geral", "general_ends_at")}
          </div>
          <label style={ui.label}>Lote da venda geral (vazio = só pela data)</label>
          <input
            style={ui.input}
            type="number"
            min={1}
            value={editing.general_lot ?? ""}
            onChange={(e) => set({ general_lot: e.target.value ? Number(e.target.value) : null })}
          />
          <label style={ui.label}>
            <input
              type="checkbox"
              checked={!!editing.sell_until_sold_out}
              onChange={(e) => set({ sell_until_sold_out: e.target.checked })}
            />{" "}
            Vender enquanto durar o estoque (a data final não encerra a venda geral)
          </label>
          <label style={ui.label}>Prazo de produção (dias)</label>
          <input
            style={ui.input}
            type="number"
            min={1}
            value={editing.production_days ?? 21}
            onChange={(e) => set({ production_days: Number(e.target.value) })}
          />
          <label style={ui.label}>Topo da home</label>
          <select
            style={ui.input}
            value={editing.hero_kind ?? "banner"}
            onChange={(e) => set({ hero_kind: e.target.value as Drop["hero_kind"] })}
          >
            <option value="banner">Banner</option>
            <option value="drop_video">Vídeo do drop</option>
            <option value="community_video">Vídeo da comunidade</option>
          </select>
          {textField("URL da mídia do topo", "hero_url")}
          {textField("URL da capa (card em drops anteriores)", "cover_url")}
          {textField("Instagram (post do drop)", "instagram_url")}
          {textField("Grupo do WhatsApp", "whatsapp_url")}
          {textField("Componente da página /drop (chave)", "component_key")}
          <label style={ui.label}>
            <input
              type="checkbox"
              checked={!!editing.release_leads_in_presale}
              onChange={(e) => set({ release_leads_in_presale: e.target.checked })}
            />{" "}
            Liberar e enviar o ingresso a quem se cadastrar com a pré-venda aberta
          </label>
          <label style={ui.label}>
            <input
              type="checkbox"
              checked={!!editing.is_current}
              onChange={(e) => set({ is_current: e.target.checked })}
            />{" "}
            Drop atual
          </label>
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button style={{ ...ui.button, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>
              {busy ? "Salvando..." : "Salvar"}
            </button>
            <button style={ui.ghost} onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {productsFor && (
        <ProductsPanel dropId={productsFor.id} title={productsFor.title} onClose={() => setProductsFor(null)} />
      )}
      {ticketsFor && (
        <TicketsPanel dropId={ticketsFor.id} title={ticketsFor.title} onClose={() => setTicketsFor(null)} />
      )}

      {drops.map((d) => (
        <div key={d.id} style={{ ...ui.card, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>
              {d.title} {d.is_current && <span style={{ color: "#e77e23" }}>· atual</span>}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              /{d.handle} · {PHASE_LABEL[d.phase]} · pré-venda{" "}
              {new Date(d.preorder_starts_at).toLocaleString("pt-BR")} →{" "}
              {new Date(d.preorder_ends_at).toLocaleString("pt-BR")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!d.is_current && (
              <button style={ui.ghost} onClick={() => makeCurrent(d.id)}>
                Tornar atual
              </button>
            )}
            <button style={ui.ghost} onClick={() => setProductsFor(d)}>
              Produtos
            </button>
            <button style={ui.ghost} onClick={() => setTicketsFor(d)}>
              Ingressos
            </button>
            <button style={ui.ghost} onClick={() => setEditing(d)}>
              Editar
            </button>
            <button style={ui.ghost} onClick={() => remove(d.id)}>
              Excluir
            </button>
          </div>
        </div>
      ))}
      {!drops.length && !editing && <p style={{ color: "#6b7280" }}>Nenhum drop ainda.</p>}
    </div>
  )
}

export const config = defineRouteConfig({ label: "Drops" })

export default DropsPage
