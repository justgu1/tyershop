// Cart state managed in localStorage.
// Emits "cart:update" CustomEvent whenever the cart changes.

export interface CartItem {
  variantId: string;
  title: string;
  variantTitle?: string;
  thumbnail?: string;
  price: number;  // in cents
  quantity: number;
  maxQuantity?: number;
  stockState?: 'ok' | 'out_of_stock';
}

const KEY = 'tyer_cart';
const APPLIED_PROMO_KEY = 'tyer_applied_coupon_code';

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
  const max =
    Number.isFinite(maxQuantity) && Number(maxQuantity) > 0
      ? Math.floor(Number(maxQuantity))
      : Infinity;
  return Math.max(1, Math.min(minBound, max));
}

function sanitizeMax(maxQuantity?: number): number | undefined {
  const n = Number(maxQuantity);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
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
    items[idx].quantity = clampQty(items[idx].quantity + (item.quantity ?? 1), effectiveMax);
    if (item.variantTitle) items[idx].variantTitle = item.variantTitle;
    if (item.thumbnail) items[idx].thumbnail = item.thumbnail;
    if (Number.isFinite(item.price)) items[idx].price = item.price;
  } else {
    const maxQuantity = incomingMax;
    items.push({
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
  items[idx].quantity = clampQty(items[idx].quantity + delta, items[idx].maxQuantity);
  write(items);
}

export function setQty(variantId: string, quantity: number) {
  const items = read();
  const idx = items.findIndex(i => i.variantId === variantId);
  if (idx < 0) return;
  items[idx].quantity = clampQty(quantity, items[idx].maxQuantity);
  write(items);
}

export function getItemMaxQty(variantId: string): number | undefined {
  const item = read().find(i => i.variantId === variantId);
  return sanitizeMax(item?.maxQuantity);
}

export function canIncrease(variantId: string): boolean {
  const item = read().find(i => i.variantId === variantId);
  if (!item) return false;
  const max = sanitizeMax(item.maxQuantity);
  if (!max) return true;
  return item.quantity < max;
}

export function clearCart() { write([]); }

type VariantSnapshot = {
  exists: boolean;
  soldOut: boolean;
  maxQuantity?: number;
  title?: string;
  variantTitle?: string;
  thumbnail?: string;
  price?: number;
};

function isVariantSoldOut(variant: any): boolean {
  if (!variant) return true;
  const nestedStockQty = (variant.inventory_items ?? []).reduce((sum: number, item: any) => {
    const levels = item?.inventory?.location_levels ?? [];
    const levelSum = levels.reduce((inner: number, level: any) => {
      const raw = Number(level?.stocked_quantity);
      return Number.isFinite(raw) ? inner + raw : inner;
    }, 0);
    return sum + levelSum;
  }, 0);
  const qtyRaw =
    nestedStockQty > 0 || nestedStockQty === 0
      ? nestedStockQty
      : variant.inventory_quantity ?? variant.calculated_inventory_quantity ?? variant.stocked_quantity;
  const qty = Number(qtyRaw);
  const hasQty = Number.isFinite(qty);
  const allowBackorder = variant.allow_backorder === true;
  const status = String(variant.inventory_status ?? variant.availability_status ?? '').toLowerCase();

  if (status.includes('out') || status.includes('sold')) return true;
  if (status.includes('in_stock') || status.includes('available')) return false;
  if (variant.available_for_sale === true || variant.in_stock === true) return false;
  if (variant.available_for_sale === false || variant.in_stock === false) return true;
  if (hasQty && qty > 0) return false;
  if (hasQty && qty <= 0 && !allowBackorder) return true;
  return false;
}

function getVariantMaxQty(variant: any): number | undefined {
  if (!variant || variant.allow_backorder === true) return undefined;
  const nestedStockQty = (variant.inventory_items ?? []).reduce((sum: number, item: any) => {
    const levels = item?.inventory?.location_levels ?? [];
    const levelSum = levels.reduce((inner: number, level: any) => {
      const raw = Number(level?.stocked_quantity);
      return Number.isFinite(raw) ? inner + raw : inner;
    }, 0);
    return sum + levelSum;
  }, 0);
  const qtyRaw =
    nestedStockQty > 0 || nestedStockQty === 0
      ? nestedStockQty
      : variant.inventory_quantity ?? variant.calculated_inventory_quantity ?? variant.stocked_quantity;
  const qty = Number(qtyRaw);
  if (!Number.isFinite(qty)) return undefined;
  return Math.max(0, Math.floor(qty));
}

function getStoreConfig() {
  const key = 'pk_56a7e1a252f159acbc6c590a025dac7a69d4c869fd621f0273ad10c2a87e3975';
  if (typeof window === 'undefined') {
    return { base: 'http://localhost:9003', key };
  }
  // No browser: mesma origem (ex. http://localhost:4321/store/...). O `vite.server.proxy` em
  // astro.config.mjs encaminha /store (e /auth) ao Medusa — evita CORS. Não usar :9003 direto no cliente.
  return { base: '', key };
}

async function fetchVariantSnapshot(variantId: string): Promise<VariantSnapshot> {
  if (!variantId) return { exists: false, soldOut: true };
  const { base, key } = getStoreConfig();
  try {
    const res = await fetch(`${base}/store/variants/${variantId}`, {
      headers: { 'x-publishable-api-key': key },
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
    const optionTitle = String(variant?.title || '').trim() || undefined;
    const price = Number(variant?.calculated_price?.calculated_amount ?? variant?.prices?.[0]?.amount ?? 0);
    const maxQuantity = getVariantMaxQty(variant);
    return {
      exists: true,
      soldOut: isVariantSoldOut(variant),
      maxQuantity,
      title,
      variantTitle: optionTitle,
      thumbnail: thumb,
      price: Number.isFinite(price) && price > 0 ? price : undefined,
    };
  } catch {
    return { exists: true, soldOut: false };
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

  snapshots.forEach(({ item, snapshot }) => {
    if (!snapshot.exists) {
      removedVariantIds.push(item.variantId);
      return;
    }
    const merged: CartItem = {
      ...item,
      title: snapshot.title || item.title,
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
    nextItems.push(merged);
  });

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
