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
}

const KEY = 'tyer_cart';
const APPLIED_PROMO_KEY = 'tyer_applied_coupon_code';

function read(): CartItem[] {
  if (typeof localStorage === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
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
