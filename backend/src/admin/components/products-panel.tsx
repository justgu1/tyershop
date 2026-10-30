import { useEffect, useMemo, useState } from "react"
import { adminFetch, ui } from "../lib/api"

type Product = { id: string; title: string; thumbnail: string | null; status: string }

export function ProductsPanel({ dropId, title, onClose }: { dropId: string; title: string; onClose: () => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    Promise.all([
      adminFetch<{ products: Product[] }>("/admin/products?limit=500&fields=id,title,thumbnail,status&order=title"),
      adminFetch<{ product_ids: string[] }>(`/admin/drops/${dropId}/products`),
    ])
      .then(([p, d]) => {
        setProducts(p.products)
        setSelected(new Set(d.product_ids))
      })
      .catch((e) => setError(e.message))
  }, [dropId])

  const visible = useMemo(
    () => products.filter((p) => p.title.toLowerCase().includes(q.trim().toLowerCase())),
    [products, q]
  )

  const toggle = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  async function save() {
    setBusy(true)
    setError("")
    try {
      await adminFetch(`/admin/drops/${dropId}/products`, {
        method: "POST",
        body: JSON.stringify({ product_ids: [...selected] }),
      })
      setSavedAt(Date.now())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={ui.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Produtos · {title}</h2>
        <button style={ui.ghost} onClick={onClose}>
          Fechar
        </button>
      </div>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "8px 0" }}>
        Só os produtos marcados aparecem na página /drop deste drop.
      </p>
      <input style={ui.input} placeholder="Buscar produto" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
      <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
        {visible.map((p) => (
          <label
            key={p.id}
            style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderBottom: "1px solid #f3f4f6", fontSize: 14 }}
          >
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
            {p.thumbnail ? <img src={p.thumbnail} alt="" width={32} height={32} style={{ objectFit: "cover", borderRadius: 4 }} /> : null}
            <span>{p.title}</span>
            {p.status !== "published" && <span style={{ color: "#9ca3af", fontSize: 12 }}>({p.status})</span>}
          </label>
        ))}
        {!visible.length && <p style={{ padding: 12, color: "#6b7280" }}>Nenhum produto.</p>}
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
        <button style={{ ...ui.button, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>
          {busy ? "Salvando..." : `Salvar (${selected.size})`}
        </button>
        {savedAt && !busy && <span style={{ fontSize: 13, color: "#16a34a" }}>Salvo!</span>}
      </div>
    </div>
  )
}
