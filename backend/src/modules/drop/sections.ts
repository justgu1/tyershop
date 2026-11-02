export type SectionProduct = {
  id: string
  collection?: { id: string; handle: string; title: string; metadata?: Record<string, unknown> | null } | null
}

export type DropSection = {
  key: string
  title: string
  label: string | null
  banner_url: string | null
  banner_mobile_url: string | null
  product_ids: string[]
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

/**
 * Uma faixa por coleção, na ordem de `metadata.order` (depois título). A faixa leva o banner de
 * `metadata.banner_url` (e `banner_mobile_url` no celular), se houver; sem ele o site desenha a separação padrão. Produto sem coleção
 * vai numa faixa final sem título, para não sumir da tela.
 */
export function buildSections(products: SectionProduct[]): DropSection[] {
  const byKey = new Map<string, DropSection & { order: number }>()
  for (const p of products) {
    const c = p.collection
    const key = c?.id ?? "sem-colecao"
    let section = byKey.get(key)
    if (!section) {
      const order = Number(c?.metadata?.order)
      section = {
        key,
        title: c?.title ?? "",
        label: str(c?.metadata?.label),
        banner_url: str(c?.metadata?.banner_url),
        banner_mobile_url: str(c?.metadata?.banner_mobile_url),
        product_ids: [],
        order: Number.isFinite(order) ? order : c ? 1000 : 2000,
      }
      byKey.set(key, section)
    }
    section.product_ids.push(p.id)
  }
  return [...byKey.values()]
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "pt-BR"))
    .map(({ order, ...section }) => section)
}
