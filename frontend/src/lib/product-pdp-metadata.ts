/** Chaves em `product.metadata` (Medusa) — ver `.env.example` / comentários na página PDP. */

export type TechSheetRow = { label: string; value: string };

export function parseTechSheetRows(metadata: Record<string, unknown> | undefined | null): TechSheetRow[] {
  if (!metadata) return [];
  const raw = metadata.tech_sheet;
  if (raw == null) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return parsed
        .map((row: any) => ({
          label: String(row?.label ?? row?.k ?? '').trim(),
          value: String(row?.value ?? row?.v ?? '').trim(),
        }))
        .filter((r) => r.label && r.value);
    }
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed as Record<string, unknown>).map(([k, v]) => ({
        label: String(k).trim(),
        value: String(v ?? '').trim(),
      }));
    }
  } catch {
    return [];
  }
  return [];
}

export function compositionText(metadata: Record<string, unknown> | undefined | null): string | null {
  if (!metadata) return null;
  const c = metadata.composition ?? metadata.diferenciais ?? metadata.material_composition;
  const s = typeof c === 'string' ? c.trim() : '';
  return s || null;
}

export type FaqItem = { q: string; a: string };

export function parseFaqItems(metadata: Record<string, unknown> | undefined | null): FaqItem[] {
  if (!metadata) return [];
  const raw = metadata.faq_json ?? metadata.pdp_faq;
  if (raw == null) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row: any) => ({
        q: String(row?.q ?? row?.question ?? '').trim(),
        a: String(row?.a ?? row?.answer ?? '').trim(),
      }))
      .filter((r) => r.q && r.a);
  } catch {
    return [];
  }
}

export function metaString(metadata: Record<string, unknown> | undefined | null, key: string): string | null {
  if (!metadata) return null;
  const v = metadata[key];
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

export type ProductDetailBlock = { title: string; body: string };

/** Blocos estilo FAQ a partir de `metadata.pdp_details_json` (ou aliases). Cada item: `{ title, body }`. */
export function parseProductDetailBlocks(metadata: Record<string, unknown> | undefined | null): ProductDetailBlock[] {
  if (!metadata) return [];
  const raw =
    metadata.pdp_details_json ?? metadata.product_details_json ?? metadata.pdp_details ?? metadata.product_details;
  if (raw == null) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row: any) => ({
        title: String(row?.title ?? row?.heading ?? row?.label ?? row?.q ?? '').trim(),
        body: String(row?.body ?? row?.text ?? row?.content ?? row?.value ?? row?.a ?? '').trim(),
      }))
      .filter((r) => r.title && r.body);
  } catch {
    return [];
  }
}
