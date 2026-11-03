import { getMedusaStoreUrl, getPublishableKey } from './medusa-env';
import { getProductListQueryString, resolveDefaultRegionId } from './medusa-pricing';
import { isHiddenCollection } from './collections';

export type CatalogSection = { key: string; title: string; href: string | null; products: any[] };

const createdAt = (p: any) => new Date(p?.created_at ?? 0).getTime() || 0;

/** Tudo o que está à venda fora das pré-vendas: uma seção por coleção visível e as pulseiras, da peça mais nova para a mais antiga. */
export async function fetchCatalogSections(): Promise<CatalogSection[]> {
  const base = getMedusaStoreUrl();
  const headers = { 'x-publishable-api-key': getPublishableKey() };
  const sections: CatalogSection[] = [];
  try {
    const q = getProductListQueryString(await resolveDefaultRegionId(base, headers));
    const [cRes, catRes] = await Promise.all([
      fetch(`${base}/store/collections?limit=50&fields=id,title,handle,metadata`, { headers, signal: AbortSignal.timeout(8000) }),
      fetch(`${base}/store/product-categories?handle=pulseiras`, { headers, signal: AbortSignal.timeout(5000) }),
    ]);
    const collections: any[] = cRes.ok ? ((await cRes.json()).collections ?? []).filter((c: any) => !isHiddenCollection(c)) : [];
    const lists = await Promise.all(
      collections.map((c) =>
        fetch(`${base}/store/products?${q}&collection_id[]=${c.id}&limit=20`, { headers, signal: AbortSignal.timeout(8000) })
          .then((r) => (r.ok ? r.json() : { products: [] }))
          .then((d) => d.products ?? [])
      )
    );
    collections.forEach((c, i) => {
      if (lists[i].length) sections.push({ key: `col-${c.id}`, title: c.title, href: `/collections/${c.handle}`, products: lists[i] });
    });
    const cat = catRes.ok ? ((await catRes.json()).product_categories ?? [])[0] : null;
    if (cat?.id) {
      const r = await fetch(`${base}/store/products?${q}&category_id[]=${cat.id}&limit=20`, { headers, signal: AbortSignal.timeout(8000) });
      const list = r.ok ? ((await r.json()).products ?? []) : [];
      if (list.length) sections.push({ key: 'pulseiras', title: 'Pulseiras', href: null, products: list });
    }
  } catch {
    /* Medusa fora do ar: sem seções */
  }
  return sections
    .map((s) => ({ ...s, products: [...s.products].sort((a, b) => createdAt(b) - createdAt(a)) }))
    .sort((a, b) => createdAt(b.products[0]) - createdAt(a.products[0]));
}
