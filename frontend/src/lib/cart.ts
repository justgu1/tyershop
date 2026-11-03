// Cart state managed in localStorage.
// Emits "cart:update" CustomEvent whenever the cart changes.

import { getVariantMaxQty as getVariantMaxQtyFromProduct, isVariantSoldOut as isVariantSoldOutFromProduct } from './product-variants';
import { getVariantPriceInfo } from './medusa-pricing';

export interface CartItem {
  variantId: string;
  /** Handle do produto, para o título da bag levar à página dele. */
  handle?: string;
  title: string;
  variantTitle?: string;
  thumbnail?: string;
  price: number;  // in cents
  quantity: number;
  maxQuantity?: number;
  stockState?: 'ok' | 'out_of_stock';
  /** Peça em pré-venda: o limite por pessoa vale somando todas as variações do mesmo produto. */
  productId?: string;
  groupMax?: number;
}

const KEY = 'tyer_cart';
const APPLIED_PROMO_KEY = 'tyer_applied_coupon_code';

/** Quando o inventário ainda não devolveu `maxQuantity` (>0), limita quantidade no carrinho (evita pedidos absurdos). */
export const CART_MAX_WHEN_UNKNOWN = 99;

function read(): CartItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => item && typeof item.variantId === 'string')
      .map((item) => ({
        ...item,
        stockState: item.stockState === 'out_of_stock' ? 'out_of_stock' : 'ok',
      }));
  } catch {
    return [];
  }
}

/** Cupom aplicado com sucesso na loja (Medusa); re-hidratado após F5. */
export function getAppliedPromoCode(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem(APPLIED_PROMO_KEY);
  return v && v.trim() ? v.trim() : null;
}

export function setAppliedPromoCode(code: string | null) {
  if (typeof localStorage === 'undefined') return;
  if (code && code.trim()) localStorage.setItem(APPLIED_PROMO_KEY, code.trim());
  else localStorage.removeItem(APPLIED_PROMO_KEY);
}

function write(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  if (items.length === 0) setAppliedPromoCode(null);
  window.dispatchEvent(new CustomEvent('cart:update', { detail: { items } }));
}

function clampQty(qty: number, maxQuantity?: number): number {
  const normalized = Number.isFinite(qty) ? Math.floor(qty) : 1;
  const minBound = Math.max(1, normalized);
  const explicit =
    Number.isFinite(maxQuantity) && Number(maxQuantity) > 0
      ? Math.floor(Number(maxQuantity))
      : null;
  const max = explicit ?? CART_MAX_WHEN_UNKNOWN;
  return Math.max(1, Math.min(minBound, max));
}

function sanitizeMax(maxQuantity?: number): number | undefined {
  const n = Number(maxQuantity);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

/** Quanto ainda cabe nesta linha pelo limite por pessoa do produto (as outras variações já ocupam parte). */
function groupRoom(items: CartItem[], item: CartItem): number {
  if (!item.productId || !item.groupMax) return Infinity;
  const others = items
    .filter((i) => i.variantId !== item.variantId && i.productId === item.productId)
    .reduce((s, i) => s + i.quantity, 0);
  return Math.max(0, item.groupMax - others);
}

/** Limite máximo por linha para UI (stepper) e coerente com `clampQty`. */
export function maxOrderableUnits(item: CartItem): number {
  const s = sanitizeMax(item.maxQuantity);
  const base = s ?? (item.stockState === 'out_of_stock' ? 1 : CART_MAX_WHEN_UNKNOWN);
  return Math.max(1, Math.min(base, groupRoom(read(), item)));
}

export function getCart(): CartItem[] { return read(); }

export function getCount(): number { return read().reduce((s, i) => s + i.quantity, 0); }

export function getTotal(): number { return read().reduce((s, i) => s + i.price * i.quantity, 0); }

export function addItem(item: Omit<CartItem, 'quantity'> & { quantity?: number }) {
  const items = read();
  const idx = items.findIndex(i => i.variantId === item.variantId);
  const incomingMax = sanitizeMax(item.maxQuantity);
  if (idx >= 0) {
    const effectiveMax = sanitizeMax(items[idx].maxQuantity) ?? incomingMax;
    items[idx].maxQuantity = effectiveMax;
    items[idx].quantity = clampQty(items[idx].quantity + (item.quantity ?? 1), Math.min(effectiveMax ?? CART_MAX_WHEN_UNKNOWN, groupRoom(items, items[idx])));
    if (item.variantTitle) items[idx].variantTitle = item.variantTitle;
    if (item.thumbnail) items[idx].thumbnail = item.thumbnail;
    if (Number.isFinite(item.price)) items[idx].price = item.price;
  } else {
    const maxQuantity = incomingMax;
    const sibling = item.productId ? items.find((i) => i.productId === item.productId && i.groupMax) : undefined;
    if (sibling && groupRoom(items, { ...item, groupMax: sibling.groupMax } as CartItem) < 1) return;
    items.push({
      ...(sibling ? { productId: sibling.productId, groupMax: sibling.groupMax } : {}),
      ...item,
      stockState: 'ok',
      maxQuantity,
      quantity: clampQty(item.quantity ?? 1, maxQuantity),
    });
  }
  write(items);
}

export function removeItem(variantId: string) {
  write(read().filter(i => i.variantId !== variantId));
}

export function updateQty(variantId: string, delta: number) {
  const items = read();
  const idx = items.findIndex(i => i.variantId === variantId);
  if (idx < 0) return;
  items[idx].quantity = clampQty(items[idx].quantity + delta, Math.min(items[idx].maxQuantity ?? CART_MAX_WHEN_UNKNOWN, groupRoom(items, items[idx])));
  write(items);
}

export function setQty(variantId: string, quantity: number) {
  const items = read();
  const idx = items.findIndex(i => i.variantId === variantId);
  if (idx < 0) return;
  items[idx].quantity = clampQty(quantity, Math.min(items[idx].maxQuantity ?? CART_MAX_WHEN_UNKNOWN, groupRoom(items, items[idx])));
  write(items);
}

export function getItemMaxQty(variantId: string): number | undefined {
  const item = read().find(i => i.variantId === variantId);
  return sanitizeMax(item?.maxQuantity);
}

export function canIncrease(variantId: string): boolean {
  const item = read().find(i => i.variantId === variantId);
  if (!item) return false;
  return item.quantity < maxOrderableUnits(item);
}

export function clearCart() { write([]); }

type VariantSnapshot = {
  exists: boolean;
  soldOut: boolean;
  maxQuantity?: number;
  title?: string;
  handle?: string;
  variantTitle?: string;
  thumbnail?: string;
  price?: number;
};

function getStoreConfig() {
  if (typeof window === 'undefined') {
    const key = process.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY || '';
    return { base: 'http://localhost:9003', key, regionId: '' };
  }
  // No browser: mesma origem (ex. http://localhost:4321/store/...). O `vite.server.proxy` em
  // astro.config.mjs encaminha /store (e /auth) ao Medusa — evita CORS. Não usar :9003 direto no cliente.
  // Key/region vindas do Layout.astro (window.__MEDUSA_PK__/__MEDUSA_REGION_ID__), lidas do `.env` em runtime — ver lib/medusa-env.ts.
  const key = (window as any).__MEDUSA_PK__ || '';
  const regionId = (window as any).__MEDUSA_REGION_ID__ || '';
  return { base: '', key, regionId };
}

/**
 * `/store/variants/:id` nunca existiu (nem no Medusa v2 core, nem em rota
 * custom nossa) — 404 sempre. O endpoint nativo certo é
 * `/store/product-variants/:id` (desde Medusa 2.11.2), que já devolve
 * `{ variant }` no formato que o resto desta função espera; só falta pedir
 * os campos extras (preço calculado, estoque, dados do produto) via
 * `fields=`, do mesmo jeito que `medusa-pricing.ts` já faz pra listagem.
 */
const VARIANT_SNAPSHOT_FIELDS = [
  'id',
  'title',
  'allow_backorder',
  'inventory_quantity',
  '*prices',
  '*calculated_price',
  '+inventory_items.inventory.location_levels.stocked_quantity',
  'product.id',
  'product.title',
  'product.handle',
  'product.thumbnail',
  '*product.images',
].join(',');

async function fetchVariantSnapshot(variantId: string): Promise<VariantSnapshot> {
  if (!variantId) return { exists: false, soldOut: true };
  const { base, key, regionId } = getStoreConfig();
  try {
    /* `*calculated_price` sem region_id faz a Store API responder 400
       ("Missing required pricing context") — sem region resolvida ainda
       (ex.: window.__MEDUSA_REGION_ID__ não carregou), pede sem preço em
       vez de perder a chamada inteira; `*prices` cobre o fallback de preço. */
    const fields = regionId ? VARIANT_SNAPSHOT_FIELDS : VARIANT_SNAPSHOT_FIELDS.replace(',*calculated_price', '');
    const qs = new URLSearchParams({ fields });
    if (regionId) qs.set('region_id', regionId);
    const res = await fetch(`${base}/store/product-variants/${variantId}?${qs.toString()}`, {
      headers: { 'x-publishable-api-key': key, ...(storedToken() ? { authorization: `Bearer ${storedToken()}` } : {}) },
    });
    // 404 ou rota indisponível: não esvaziar o carrinho no F5 (localStorage).
    if (res.status === 404) return { exists: true, soldOut: false };
    if (!res.ok) return { exists: true, soldOut: false };
    const data = await res.json();
    const variant = data?.variant;
    if (!variant) return { exists: true, soldOut: false };
    const product = variant?.product || data?.product;
    const thumb = product?.thumbnail || product?.images?.[0]?.url || undefined;
    const title = product?.title || undefined;
    const handle = product?.handle || undefined;
    const optionTitle = String(variant?.title || '').trim() || undefined;
    // `calculated_amount`/`prices[].amount` não vêm garantidamente em centavos
    // (depende de como o preço foi cadastrado) — mesma normalização usada na
    // listagem de produtos (medusa-pricing.ts), pra não gravar preço 100x errado.
    const priceInfo = getVariantPriceInfo(variant);
    const price = priceInfo?.amountCents;
    const mq = getVariantMaxQtyFromProduct(variant);
    const maxQuantity = mq == null ? undefined : mq;
    return {
      exists: true,
      /* Resposta explícita da Store API: tratar qty numérica como fiável. */
      soldOut: isVariantSoldOutFromProduct(variant, true),
      maxQuantity,
      title,
      handle,
      variantTitle: optionTitle,
      thumbnail: thumb,
      price: typeof price === 'number' && price > 0 ? price : undefined,
    };
  } catch {
    return { exists: true, soldOut: false };
  }
}

/** Variantes de drop fora de venda (ou sem ingresso na pré-venda). Falha de rede não esvazia a bag. */
async function fetchBlockedByDrop(variantIds: string[]): Promise<{ blocked: Set<string>; limit: { max: number; productByVariant: Record<string, string> } | null }> {
  try {
    const { base, key } = getStoreConfig();
    const token = localStorage.getItem('tyer_token');
    const res = await fetch(`${base}/store/drop/gate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-publishable-api-key': key,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ variant_ids: variantIds }),
    });
    if (!res.ok) return { blocked: new Set(), limit: null };
    const body = await res.json();
    const pl = body.presale_limit;
    return {
      blocked: new Set(body.blocked_variant_ids ?? []),
      limit: pl?.max_per_product ? { max: Number(pl.max_per_product), productByVariant: pl.product_by_variant ?? {} } : null,
    };
  } catch {
    return { blocked: new Set(), limit: null };
  }
}

export async function validateCartItems(): Promise<{
  items: CartItem[];
  removedVariantIds: string[];
  outOfStockVariantIds: string[];
}> {
  const current = read();
  if (!current.length) return { items: [], removedVariantIds: [], outOfStockVariantIds: [] };

  const snapshots = await Promise.all(
    current.map(async (item) => ({ item, snapshot: await fetchVariantSnapshot(item.variantId) }))
  );

  const nextItems: CartItem[] = [];
  const removedVariantIds: string[] = [];
  const outOfStockVariantIds: string[] = [];

  const { blocked, limit } = await fetchBlockedByDrop(current.map((i) => i.variantId));

  snapshots.forEach(({ item, snapshot }) => {
    if (!snapshot.exists || blocked.has(item.variantId)) {
      removedVariantIds.push(item.variantId);
      return;
    }
    const merged: CartItem = {
      ...item,
      title: snapshot.title || item.title,
      handle: snapshot.handle || item.handle,
      variantTitle: snapshot.variantTitle || item.variantTitle,
      thumbnail: snapshot.thumbnail || item.thumbnail,
      price: Number.isFinite(Number(snapshot.price)) && Number(snapshot.price) > 0 ? Number(snapshot.price) : item.price,
      maxQuantity: snapshot.maxQuantity ?? item.maxQuantity,
      stockState: snapshot.soldOut ? 'out_of_stock' : 'ok',
    };
    if (merged.stockState === 'out_of_stock') outOfStockVariantIds.push(merged.variantId);
    if (merged.stockState === 'ok') {
      merged.quantity = clampQty(merged.quantity, merged.maxQuantity);
    } else {
      merged.quantity = Math.max(1, Math.floor(Number(merged.quantity) || 1));
    }
    const productId = limit?.productByVariant[item.variantId];
    if (productId && limit) {
      merged.productId = productId;
      merged.groupMax = limit.max;
    } else {
      delete merged.productId;
      delete merged.groupMax;
    }
    nextItems.push(merged);
  });

  // Quem já estava na bag acima do limite por pessoa volta para o limite, na ordem das linhas.
  const used = new Map<string, number>();
  for (const it of nextItems) {
    if (!it.productId || !it.groupMax) continue;
    const room = Math.max(0, it.groupMax - (used.get(it.productId) ?? 0));
    it.quantity = Math.min(it.quantity, room);
    used.set(it.productId, (used.get(it.productId) ?? 0) + it.quantity);
  }
  for (let n = nextItems.length - 1; n >= 0; n--) {
    if (nextItems[n].productId && nextItems[n].quantity < 1) {
      removedVariantIds.push(nextItems[n].variantId);
      nextItems.splice(n, 1);
    }
  }

  const changed =
    removedVariantIds.length > 0 ||
    nextItems.length !== current.length ||
    JSON.stringify(nextItems) !== JSON.stringify(current);
  if (changed) write(nextItems);

  return { items: nextItems, removedVariantIds, outOfStockVariantIds };
}

export function hasOutOfStockItems(items: CartItem[] = read()): boolean {
  return items.some((item) => item.stockState === 'out_of_stock');
}

function storedToken(): string {
  try {
    return localStorage.getItem('tyer_token') || '';
  } catch {
    return '';
  }
}
