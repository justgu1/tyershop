/**
 * Algoritmo puro de "qual variante bate com a combinação de opções
 * escolhida" — sem DOM, sem side-effect. Extraído de `product-card-client.ts`
 * pra ser reaproveitado também no mosaico de coleção (CollectionMosaicItem),
 * que antes resolvia cor sozinho sem levar tamanho em conta.
 */

export type VariantMap = {
  id: string;
  title: string;
  price: number;
  soldOut: boolean;
  allowBackorder?: boolean;
  maxQty?: number | null;
  options: Record<string, string>;
  images?: string[];
  slideUrls?: string[];
  priceDisplay?: string;
  originalDisplay?: string | null;
  discountPercent?: number;
};

export type OptionRow = { id: string; title: string; values: string[] };
export type SelectedMap = Record<string, string>;

export function variantMatches(variant: VariantMap, selected: SelectedMap): boolean {
  return Object.entries(selected).every(([k, v]) => !v || variant.options?.[k] === v);
}

/** `stockReliable`: quando true, `maxQty <= 0` também conta como esgotado
 * mesmo sem a flag `soldOut` — mesma regra de `product-card-client.ts`
 * original, mantida aqui pra não mudar comportamento ao compartilhar. */
export function variantIsOutOfStock(v: VariantMap, stockReliable = false): boolean {
  if (v.allowBackorder) return false;
  if (v.soldOut) return true;
  if (stockReliable) {
    const mq = v.maxQty;
    return mq != null && Number.isFinite(Number(mq)) && Number(mq) <= 0;
  }
  return false;
}

export function getFirstAvailable(variants: VariantMap[], selected: SelectedMap, stockReliable = false): VariantMap | null {
  return variants.find((v) => variantMatches(v, selected) && !variantIsOutOfStock(v, stockReliable)) || null;
}

export function selectionComplete(optionRows: OptionRow[], sel: SelectedMap): boolean {
  return optionRows.length > 0 && optionRows.every((row) => String(sel[row.id] ?? '').trim().length > 0);
}

export function findExactVariantForSelection(
  variants: VariantMap[],
  optionRows: OptionRow[],
  sel: SelectedMap
): VariantMap | null {
  if (!selectionComplete(optionRows, sel)) return null;
  return (
    variants.find((v) =>
      optionRows.every((row) => String(v.options?.[row.id] ?? '').trim() === String(sel[row.id] ?? '').trim())
    ) || null
  );
}

/** Mesma prioridade usada no ProductCard: exata > primeira disponível pra
 * combinação parcial > qualquer combinação parcial > primeira não-esgotada
 * > primeira de todas. */
export function resolveVariant(
  variants: VariantMap[],
  optionRows: OptionRow[],
  selected: SelectedMap,
  stockReliable = false
): VariantMap | null {
  return (
    findExactVariantForSelection(variants, optionRows, selected) ||
    getFirstAvailable(variants, selected, stockReliable) ||
    variants.find((v) => variantMatches(v, selected)) ||
    variants.find((v) => !variantIsOutOfStock(v, stockReliable)) ||
    variants[0] ||
    null
  );
}
