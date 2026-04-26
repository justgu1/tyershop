/**
 * Medusa v2: variant prices vêm de `calculated_price` com region_id/currency_code
 * (ver https://docs.medusajs.com/resources/storefront-development/products/price)
 */
const DEFAULT_FIELDS =
  [
    'id',
    'title',
    'handle',
    'thumbnail',
    'description',
    'metadata',
    '*options',
    '*options.values',
    '*images',
    '*variants',
    '*variants.options',
    '*variants.options.option',
    '+variants.inventory_items.inventory.location_levels.stocked_quantity',
    '*variants.prices',
    '*variants.calculated_price',
    '*variants.inventory_quantity',
    '*variants.manage_inventory',
    '*variants.allow_backorder',
    '*variants.metadata',
  ].join(',');

export function getProductListQueryString(regionId: string | null): string {
  const p = new URLSearchParams();
  p.set('fields', DEFAULT_FIELDS);
  if (regionId) p.set('region_id', regionId);
  else p.set('currency_code', 'brl');
  return p.toString();
}

export async function resolveDefaultRegionId(
  baseUrl: string,
  headers: Record<string, string>,
  timeout = 5000
): Promise<string | null> {
  const fromEnv = import.meta.env.PUBLIC_MEDUSA_REGION_ID as string | undefined;
  if (fromEnv) return fromEnv;
  try {
    const r = await fetch(`${baseUrl}/store/regions`, {
      headers,
      signal: AbortSignal.timeout(timeout),
    });
    if (!r.ok) return null;
    const { regions } = await r.json();
    if (!Array.isArray(regions) || regions.length === 0) return null;
    const brlRegion = regions.find((region: any) => (region?.currency_code || '').toString().toLowerCase() === 'brl');
    return brlRegion?.id ?? regions[0]?.id ?? null;
  } catch {
    return null;
  }
}

export interface VariantPriceInfo {
  display: string;
  amountCents: number;
  originalAmountCents: number | null;
  originalDisplay: string | null;
  isOnSale: boolean;
  currency: string;
}

/**
 * `calculated_amount` e `prices[].amount` estão na menor unidade (centavos).
 */
export function getVariantPriceInfo(variant: any | undefined): VariantPriceInfo | null {
  function toNumber(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const normalized = value.replace(',', '.').trim();
      if (!normalized) return null;
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function looksLikeMajorUnit(value: number): boolean {
    return value > 0 && value < 1000 && !Number.isInteger(value);
  }

  function normalizeToCents(value: unknown, raw?: { value?: unknown; precision?: unknown } | null): number | null {
    if (raw && raw.value != null) {
      const rawNum = toNumber(raw.value);
      if (rawNum != null && rawNum > 0) return Math.round(rawNum * 100);
    }
    const num = toNumber(value);
    if (num == null || num <= 0) return null;
    if (looksLikeMajorUnit(num)) return Math.round(num * 100);
    if (num < 1000) return Math.round(num * 100);
    return Math.round(num);
  }

  if (!variant) return null;
  const cp = variant.calculated_price;
  if (cp) {
    const currency = (cp.currency_code || 'brl').toString().toUpperCase();
    const amountCents = normalizeToCents(cp.calculated_amount, cp.raw_calculated_amount);
    if (!amountCents || amountCents <= 0) return null;
    const display = (amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency });
    let originalAmountCents = normalizeToCents(cp.original_amount, cp.raw_original_amount);
    if (!originalAmountCents && Array.isArray(variant.prices)) {
      const sameCurrency = variant.prices
        .filter((p: any) => (p?.currency_code || '').toString().toUpperCase() === currency)
        .map((p: any) => normalizeToCents(p?.amount, p?.raw_amount))
        .filter((val: number | null): val is number => typeof val === 'number' && val > 0);
      if (sameCurrency.length) {
        const maxBase = Math.max(...sameCurrency);
        if (maxBase > amountCents) originalAmountCents = maxBase;
      }
    }
    let originalDisplay: string | null = null;
    const isOnSale = !!originalAmountCents && originalAmountCents > amountCents;
    if (isOnSale && originalAmountCents) {
      originalDisplay = (originalAmountCents / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency,
      });
    }
    return { display, amountCents, originalAmountCents, originalDisplay, isOnSale, currency };
  }
  const p = variant.prices?.[0];
  const fallbackAmountCents = normalizeToCents(p?.amount, p?.raw_amount);
  if (fallbackAmountCents != null && fallbackAmountCents > 0) {
    const currency = (p.currency_code || 'brl').toString().toUpperCase();
    return {
      display: (fallbackAmountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency }),
      amountCents: fallbackAmountCents,
      originalAmountCents: null,
      originalDisplay: null,
      isOnSale: false,
      currency,
    };
  }
  return null;
}
