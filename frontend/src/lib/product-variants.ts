import { getVariantPriceInfo } from './medusa-pricing';
import { getVariantGalleryUrls, getVariantSlideUrls } from './product-variant-gallery';
import { optionRowKind, sortSizeOptionValues } from './variant-option-ui';

export type OptionRow = { id: string; title: string; values: string[] };

export type NormalizedVariantForClient = {
  id: string;
  title: string;
  price: number;
  soldOut: boolean;
  allowBackorder?: boolean;
  maxQty: number | null;
  options: Record<string, string>;
  optionTitles: Record<string, string>;
  images: string[];
  slideUrls: string[];
  priceDisplay: string;
  originalDisplay: string | null;
  discountPercent: number;
};

function sumNestedStockedQuantity(v: any): number {
  return (v?.inventory_items ?? []).reduce((sum: number, item: any) => {
    const levels = item?.inventory?.location_levels ?? [];
    return (
      sum +
      levels.reduce((inner: number, level: any) => {
        const raw = Number(level?.stocked_quantity);
        return Number.isFinite(raw) ? inner + raw : inner;
      }, 0)
    );
  }, 0);
}

/** Só soma `inventory_items` quando existem linhas; lista vazia não é “0 em stock”, é “sem dados de inventário”. */
function resolveVariantQtyRaw(v: any): { qtyRaw: unknown; fromNested: boolean } {
  const items = v?.inventory_items ?? [];
  if (items.length > 0) {
    return { qtyRaw: sumNestedStockedQuantity(v), fromNested: true };
  }
  return {
    qtyRaw: v?.inventory_quantity ?? v?.calculated_inventory_quantity ?? v?.stocked_quantity,
    fromNested: false,
  };
}

export function isVariantSoldOut(v: any, enforceQtyWhenPresent = false): boolean {
  if (!v) return true;
  const { qtyRaw, fromNested } = resolveVariantQtyRaw(v);
  const qty = Number(qtyRaw);
  const hasQty = Number.isFinite(qty);
  const allowBackorder = v.allow_backorder === true;
  const status = String(v.inventory_status ?? v.availability_status ?? '').toLowerCase();

  if (status.includes('out') || status.includes('sold')) return true;
  if (status.includes('in_stock') || status.includes('available')) return false;
  if (v.available_for_sale === true || v.in_stock === true) return false;
  if (v.available_for_sale === false || v.in_stock === false) return true;

  if (hasQty && qty > 0) return false;
  if (hasQty && qty <= 0 && allowBackorder) return false;
  /* Stock 0 real vindo dos níveis Medusa, ou campos numéricos quando o produto foi marcado como “fiável”. */
  if (hasQty && qty <= 0 && !allowBackorder && (fromNested || enforceQtyWhenPresent)) return true;
  return false;
}

export function getVariantMaxQty(v: any): number | null {
  if (!v) return null;
  if (v.allow_backorder === true) return null;
  const { qtyRaw } = resolveVariantQtyRaw(v);
  const qty = Number(qtyRaw);
  if (!Number.isFinite(qty)) return null;
  return Math.max(0, Math.floor(qty));
}

export function stockSignalsAreReliableForProduct(product: any): boolean {
  const variants = product?.variants ?? [];
  const hasPositiveQtySignal = variants.some((v: any) => {
    const items = v?.inventory_items ?? [];
    if (items.length > 0) {
      const nested = sumNestedStockedQuantity(v);
      if (nested > 0) return true;
    }
    const n = Number(v?.inventory_quantity ?? v?.calculated_inventory_quantity ?? v?.stocked_quantity);
    return Number.isFinite(n) && n > 0;
  });
  const hasLinkedInventoryItems = variants.some((v: any) => (v?.inventory_items ?? []).length > 0);
  const hasExplicitNumericQtyField = variants.some((v: any) => {
    const raw = v?.inventory_quantity ?? v?.calculated_inventory_quantity ?? v?.stocked_quantity;
    if (raw == null || raw === '') return false;
    return Number.isFinite(Number(raw));
  });
  const hasBooleanStockSignal = variants.some(
    (v: any) =>
      v?.available_for_sale === true ||
      v?.available_for_sale === false ||
      v?.in_stock === true ||
      v?.in_stock === false
  );
  const hasStatusSignal = variants.some((v: any) => {
    const status = String(v?.inventory_status ?? v?.availability_status ?? '').toLowerCase();
    return (
      status.includes('out') ||
      status.includes('sold') ||
      status.includes('in_stock') ||
      status.includes('available')
    );
  });
  return (
    hasPositiveQtySignal ||
    hasLinkedInventoryItems ||
    hasExplicitNumericQtyField ||
    hasBooleanStockSignal ||
    hasStatusSignal
  );
}

function variantImagesForJson(v: any, product: any): string[] {
  const [a, b] = getVariantGalleryUrls(v, product);
  return b ? [a, b] : [a];
}

function discountPercentForVariant(v: any): number {
  const info = getVariantPriceInfo(v);
  const originalCents = Number(info?.originalAmountCents ?? 0);
  const calculatedCents = Number(info?.amountCents ?? 0);
  if (originalCents > 0 && calculatedCents > 0 && originalCents > calculatedCents) {
    return Math.round(((originalCents - calculatedCents) / originalCents) * 100);
  }
  return 0;
}

export function buildNormalizedVariants(product: any, stockReliable: boolean): NormalizedVariantForClient[] {
  const variants = product?.variants ?? [];
  return variants.map((v: any) => {
    const mapped: Record<string, string> = {};
    const titles: Record<string, string> = {};
    (v.options ?? []).forEach((opt: any) => {
      const key = String(opt.option_id ?? opt.id ?? '').trim();
      if (key) {
        mapped[key] = String(opt.value ?? '').trim();
        titles[key] = String(opt.option?.title ?? opt.option_title ?? '').trim();
      }
    });
    const priceInfo = getVariantPriceInfo(v);
    const maxQty = getVariantMaxQty(v);
    return {
      id: v.id,
      title: v.title ?? '',
      price: priceInfo?.amountCents ?? 0,
      soldOut: isVariantSoldOut(v, stockReliable),
      allowBackorder: v.allow_backorder === true,
      maxQty,
      options: mapped,
      optionTitles: titles,
      images: variantImagesForJson(v, product),
      slideUrls: getVariantSlideUrls(v, product),
      priceDisplay: priceInfo?.display ?? '',
      originalDisplay: priceInfo?.originalDisplay ?? null,
      discountPercent: discountPercentForVariant(v),
    };
  });
}

export function buildOptionRows(
  normalizedVariants: NormalizedVariantForClient[],
  productOptions: any[] | undefined
): OptionRow[] {
  const optionRowsFromProduct = (productOptions ?? [])
    .map((opt: any) => {
      const id = String(opt.id ?? '').trim();
      if (!id) return null;
      const values = Array.from(
        new Set(
          normalizedVariants
            .map((variant) => String(variant.options?.[id] ?? '').trim())
            .filter((value: string) => value.length > 0)
        )
      );
      return { id, title: String(opt.title ?? '').trim(), values };
    })
    .filter(Boolean) as OptionRow[];

  const fallbackOptionMap = new Map<string, { id: string; title: string; values: string[] }>();
  normalizedVariants.forEach((variant) => {
    Object.entries(variant.options ?? {}).forEach(([id, rawValue]) => {
      const value = String(rawValue ?? '').trim();
      if (!value) return;
      const existing = fallbackOptionMap.get(id);
      const optionTitle = String(variant.optionTitles?.[id] ?? id).trim();
      if (!existing) {
        fallbackOptionMap.set(id, { id, title: optionTitle, values: [value] });
        return;
      }
      if (!existing.values.includes(value)) existing.values.push(value);
    });
  });

  const optionRowsRaw = optionRowsFromProduct.length
    ? optionRowsFromProduct
    : Array.from(fallbackOptionMap.values());
  return optionRowsRaw
    .filter((row) => row.title.trim().toLowerCase() !== 'title')
    .map((row) =>
      optionRowKind(row.title) === 'size' ? { ...row, values: sortSizeOptionValues(row.values) } : row
    );
}

export function pickDefaultVariant(product: any, stockReliable: boolean): any {
  const variants = product?.variants ?? [];
  return variants.find((v: any) => !isVariantSoldOut(v, stockReliable)) ?? variants[0];
}

/** Valores das opções na ordem das linhas (ex.: "Vermelho · P"), para o rótulo "Variação:". */
export function formatVariationValuesOnly(defaultVariant: any, optionRows: OptionRow[]): string {
  if (!defaultVariant || !optionRows.length) return '';
  const opts = defaultVariant.options ?? [];
  const parts = optionRows.map((row) => {
    const o = opts.find((x: any) => String(x.option_id ?? x.id) === row.id);
    return String(o?.value ?? '').trim();
  }).filter(Boolean);
  return parts.join(' · ');
}

export function getDefaultVariantTitle(
  defaultVariant: any,
  optionRows: OptionRow[],
  normalizedVariants: NormalizedVariantForClient[]
): string {
  const selectedDefaultByOption = Object.fromEntries(
    (defaultVariant?.options ?? []).map((opt: any) => [
      String(opt.option_id ?? opt.id ?? ''),
      String(opt.value ?? ''),
    ])
  );
  const fromRows = optionRows
    .map((row) => {
      const val = String(selectedDefaultByOption[row.id] ?? '').trim();
      if (!val) return '';
      return `${row.title}: ${val}`;
    })
    .filter((s) => s.length > 0)
    .join(' | ');
  if (fromRows) return fromRows;
  const nv = normalizedVariants.find((n) => n.id === defaultVariant?.id);
  return nv?.title || defaultVariant?.title || '';
}

/** Dados partilhados entre ProductCard e PDP. */
export function getProductVariantData(product: any) {
  const stockReliable = stockSignalsAreReliableForProduct(product);
  const normalizedVariants = buildNormalizedVariants(product, stockReliable);
  const optionRows = buildOptionRows(normalizedVariants, product.options);
  const defaultVariant = pickDefaultVariant(product, stockReliable);
  const defaultVariantTitle = getDefaultVariantTitle(defaultVariant, optionRows, normalizedVariants);
  return {
    stockReliable,
    normalizedVariants,
    optionRows,
    defaultVariant,
    defaultVariantTitle,
  };
}
