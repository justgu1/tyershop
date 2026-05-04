/**
 * Carrinho lateral — um único módulo Vite.
 * O `<script lang="ts">` no componente Astro era emitido em HTML estático sem `type="module"`,
 * o que quebrava o browser com `import` e impedia `renderCart`.
 */

import {
  getCart,
  removeItem,
  updateQty,
  setQty,
  clearCart,
  getTotal,
  getAppliedPromoCode,
  setAppliedPromoCode,
  validateCartItems,
  maxOrderableUnits,
} from '../lib/cart';
import { createMedusaCartFromLocalCart } from '../lib/medusa-checkout-cart';
declare global {
  interface Window {
    __closeSideCart?: () => void;
    __MEDUSA_URL__?: string;
    __API_URL__?: string;
  }
}

if (document.documentElement.dataset.sideCartInit === 'true') {
  /* já inicializado */
} else {
  document.documentElement.dataset.sideCartInit = 'true';

// Cart close global function (also called from Header)
function closeSideCart() {
  const sc = document.getElementById('side-cart');
  const bd = document.getElementById('side-cart-backdrop');
  if (sc) { sc.classList.remove('is-open'); sc.setAttribute('aria-hidden', 'true'); }
  if (bd) { bd.classList.remove('is-active'); }
  document.body.style.overflow = '';
}

// Expose globally so Header can call it
window.__closeSideCart = closeSideCart;

// Close button
const closeBtn = document.getElementById('side-cart-close');
if (closeBtn) {
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSideCart();
  });
}

// Backdrop
const scbd = document.getElementById('side-cart-backdrop');
if (scbd) {
  scbd.addEventListener('click', closeSideCart);
}

// Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSideCart();
});

// Cart rendering
const couponState = { code: '', discountCents: 0, applied: false };
function fmt(cents: number) {
  return (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getCartItems() { return getCart(); }
function getCartTotal() { return getTotal(); }
function getItemCount() { return getCartItems().reduce((sum, item) => sum + Number(item.quantity || 0), 0); }
function hasOutOfStock(items: ReturnType<typeof getCartItems>) {
  return items.some((item: any) => item.stockState === 'out_of_stock');
}
async function syncCartState() {
  try {
    await validateCartItems();
  } catch {
    // Falha de rede não deve quebrar a navegação.
  }
}

function renderFeedback(message: string, tone: string) {
  const el = document.getElementById('side-cart-coupon-feedback');
  if (!(el instanceof HTMLElement)) return;
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('is-success', 'is-error');
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle('is-success', tone === 'success');
  el.classList.toggle('is-error', tone === 'error');
}

async function fetchRegionId() {
  const base = '';
  const key = 'pk_56a7e1a252f159acbc6c590a025dac7a69d4c869fd621f0273ad10c2a87e3975';
  const res = await fetch(`${base}/store/regions?limit=1`, { headers: { 'x-publishable-api-key': key } });
  const data = await res.json();
  return data?.regions?.[0]?.id || null;
}

async function syncRemoteCart(items: Array<{ variantId: string; quantity: number }>) {
  const base = '';
  const key = 'pk_56a7e1a252f159acbc6c590a025dac7a69d4c869fd621f0273ad10c2a87e3975';
  const regionId = await fetchRegionId();
  if (!regionId) throw new Error('Sem regiao');
  const created = await fetch(`${base}/store/carts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-publishable-api-key': key },
    body: JSON.stringify({ region_id: regionId }),
  });
  const createdJson = await created.json();
  const cartId = createdJson?.cart?.id;
  if (!cartId) throw new Error('Sem cart id');
  for (const item of items) {
    await fetch(`${base}/store/carts/${cartId}/line-items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-publishable-api-key': key },
      body: JSON.stringify({ variant_id: item.variantId, quantity: item.quantity }),
    });
  }
  return { base, key, cartId };
}

function parseDiscountFromCart(cart: any, subtotalCents: number) {
  const total = Number(cart?.total ?? subtotalCents);
  const discountTotal = Number(cart?.discount_total ?? Math.max(0, subtotalCents - total));
  if (Number.isFinite(discountTotal) && discountTotal > 0) return Math.round(discountTotal);
  return 0;
}

/** Medusa v2: POST /store/carts/{id}/promotions valida { promo_codes: string[] } (não { code }) */
async function applyPromoToMedusa(
  code: string,
  opts: { requirePositiveDiscount?: boolean } = {}
) {
  const requirePositiveDiscount = opts.requirePositiveDiscount !== false;
  const items = getCartItems();
  if (!items.length) throw new Error('empty');
  const { base, key, cartId } = await syncRemoteCart(items);
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-publishable-api-key': key };
  const body = { promo_codes: [code] };
  let appliedResponse: any = null;
  const tryPromotion = await fetch(`${base}/store/carts/${cartId}/promotions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (tryPromotion.ok) {
    appliedResponse = await tryPromotion.json();
  } else {
    const fallback = await fetch(`${base}/store/carts/${cartId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ promo_codes: [code] }),
    });
    if (fallback.ok) appliedResponse = await fallback.json();
  }
  const cart = appliedResponse?.cart;
  if (!cart) throw new Error('invalid');
  const discountCents = parseDiscountFromCart(cart, getCartTotal());
  if (requirePositiveDiscount && discountCents <= 0) throw new Error('no discount');
  return { discountCents, cart };
}

let couponResyncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleCouponResync() {
  if (!getAppliedPromoCode() || !getCart().length) return;
  if (couponResyncTimer) clearTimeout(couponResyncTimer);
  couponResyncTimer = setTimeout(() => {
    couponResyncTimer = null;
    void rehydrateAppliedCoupon();
  }, 500);
}

async function rehydrateAppliedCoupon() {
  const code = getAppliedPromoCode();
  const input = document.getElementById('side-cart-coupon');
  if (code && input instanceof HTMLInputElement) input.value = code;
  if (!code) return;
  if (!getCart().length) {
    setAppliedPromoCode(null);
    if (input instanceof HTMLInputElement) input.value = '';
    couponState.code = '';
    couponState.applied = false;
    couponState.discountCents = 0;
    renderCart();
    return;
  }
  try {
    const { discountCents } = await applyPromoToMedusa(code, { requirePositiveDiscount: false });
    couponState.discountCents = discountCents;
    couponState.code = code;
    couponState.applied = true;
    setAppliedPromoCode(code);
    renderCart();
  } catch {
    setAppliedPromoCode(null);
    couponState.discountCents = 0;
    couponState.applied = false;
    couponState.code = '';
    if (input instanceof HTMLInputElement) input.value = '';
    renderFeedback('Nao foi possivel recalcular o cupom. Tente aplicar de novo.', 'error');
    renderCart();
  }
}

function escHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatVariantLabel(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text.includes(':')) return text;
  const parts = text
    .split(/[\/|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return text;
  return parts.map((value, idx) => `Opcao ${idx + 1}: ${value}`).join(' | ');
}

function renderCart() {
  const body  = document.getElementById('side-cart-body');
  const empty = document.getElementById('side-cart-empty');
  const subtotalEl = document.getElementById('side-cart-subtotal');
  const discountEl = document.getElementById('side-cart-discount');
  const taxesEl = document.getElementById('side-cart-taxes');
  const shippingEl = document.getElementById('side-cart-shipping');
  const totalEl = document.getElementById('side-cart-total');
  const saveTagEl = document.getElementById('side-cart-save-tag');
  const countEl = document.getElementById('side-cart-count');
  const clearAllBtn = document.getElementById('side-cart-clear-all');
  const checkoutBtn = document.getElementById('side-cart-checkout');
  if (!body || !empty || !subtotalEl || !discountEl || !taxesEl || !shippingEl || !totalEl || !saveTagEl || !countEl || !clearAllBtn) return;
  const items = getCartItems();
  if (items.length === 0) {
    couponState.discountCents = 0;
    couponState.applied = false;
    couponState.code = '';
  }

  // Remove existing items
  body.querySelectorAll('.sc-item').forEach(el => el.remove());

  empty.hidden = items.length > 0;
  empty.style.display = items.length > 0 ? 'none' : 'flex';
  countEl.textContent = `(${getItemCount()})`;
  clearAllBtn.hidden = items.length === 0;

  items.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'sc-item';
    el.setAttribute('role', 'listitem');
    const titleH = escHtml(item.title || '');
    const variantH = item.variantTitle ? escHtml(formatVariantLabel(item.variantTitle)) : '';
    const thumb = item.thumbnail || '/logo.webp';
    const maxQty = maxOrderableUnits(item);
    const isOutOfStock = (item as any).stockState === 'out_of_stock';
    el.innerHTML = `
      <div class="sc-item__head">
        <span class="sc-item__name">${titleH}</span>
      </div>
      <button class="sc-item__remove" type="button" data-id="${item.variantId}" data-action="remove" aria-label="Remover do carrinho">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <div class="sc-item__body">
        <div class="sc-item__img-wrap">
          <img class="sc-item__img" src="${thumb}" alt="" width="88" height="88" loading="lazy" decoding="async" />
        </div>
        <div class="sc-item__right">
          ${isOutOfStock ? '<div class="sc-item__stock">Sem estoque</div>' : ''}
          ${variantH ? `<div class="sc-item__variant">${variantH}</div>` : ''}
          <div class="sc-item__footer">
            <span class="sc-item__price">${fmt((item.price || 0) * (item.quantity || 1))}</span>
            <div class="sc-item__stepper" role="group" aria-label="Quantidade">
              <button class="sc-item__stepper-btn" data-id="${item.variantId}" data-action="dec" type="button" aria-label="Diminuir" ${isOutOfStock ? 'disabled' : ''}>−</button>
              <input class="sc-item__stepper-input" inputmode="numeric" pattern="[0-9]*" data-id="${item.variantId}" data-action="set" type="number" min="1" max="${maxQty}" value="${item.quantity}" aria-label="Quantidade do item" ${isOutOfStock ? 'disabled' : ''} />
              <button class="sc-item__stepper-btn" data-id="${item.variantId}" data-action="inc" type="button" aria-label="Aumentar" ${isOutOfStock ? 'disabled' : ''}>+</button>
            </div>
          </div>
        </div>
      </div>
    `;
    body.appendChild(el);
  });

  const subtotal = getCartTotal();
  const discount = Number(couponState.discountCents || 0);
  const taxes = 0;
  const shipping = 0;
  const total = Math.max(0, subtotal - discount + taxes + shipping);
  const savePct = subtotal > 0 && discount > 0 ? Math.round((discount / subtotal) * 100) : 0;
  subtotalEl.textContent = fmt(subtotal);
  discountEl.textContent = `-${fmt(discount)}`;
  taxesEl.textContent = fmt(taxes);
  shippingEl.textContent = fmt(shipping);
  totalEl.textContent = fmt(total);
  saveTagEl.hidden = savePct <= 0;
  saveTagEl.textContent = `${savePct}% OFF`;
  if (checkoutBtn instanceof HTMLButtonElement) {
    checkoutBtn.disabled = items.length === 0 || hasOutOfStock(items);
  }
  renderFeedback(
    hasOutOfStock(items) ? 'Remova itens sem estoque para finalizar a compra.' : '',
    hasOutOfStock(items) ? 'error' : ''
  );
}

// Item interaction
document.getElementById('side-cart-body')?.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  const btn = target.closest('[data-id]');
  if (!(btn instanceof HTMLElement)) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (!id) return;
  if (action !== 'remove' && action !== 'inc' && action !== 'dec') return;

  if (action === 'remove') removeItem(id);
  if (action === 'inc') updateQty(id, 1);
  if (action === 'dec') updateQty(id, -1);
  // UI + recalculo do desconto: evento cart:update (debounce) em scheduleCouponResync
});

const sideCartBody = document.getElementById('side-cart-body');
function commitManualQty(input: HTMLInputElement) {
  const id = input.dataset.id;
  if (!id) return;
  const raw = Number(input.value);
  const min = 1;
  const max = Number(input.max || '');
  const boundedMax = Number.isFinite(max) && max > 0 ? Math.floor(max) : Infinity;
  const nextQty = Math.max(min, Math.min(Number.isFinite(raw) ? Math.floor(raw) : min, boundedMax));
  setQty(id, nextQty);
}

sideCartBody?.addEventListener('change', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.action !== 'set') return;
  commitManualQty(target);
});

sideCartBody?.addEventListener('keydown', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.action !== 'set') return;
  if (e.key !== 'Enter') return;
  e.preventDefault();
  commitManualQty(target);
});

document.getElementById('side-cart-clear-all')?.addEventListener('click', () => {
  clearCart();
  couponState.discountCents = 0;
  couponState.applied = false;
  couponState.code = '';
  renderFeedback('', '');
  const couponInput = document.getElementById('side-cart-coupon');
  if (couponInput instanceof HTMLInputElement) couponInput.value = '';
  renderCart();
});

document.getElementById('side-cart-apply-coupon')?.addEventListener('click', async () => {
  const input = document.getElementById('side-cart-coupon');
  if (!(input instanceof HTMLInputElement)) return;
  const code = input.value.trim();
  if (!code) {
    renderFeedback('Digite um cupom para aplicar.', 'error');
    return;
  }
  const items = getCartItems();
  if (!items.length) {
    renderFeedback('Adicione produtos para aplicar cupom.', 'error');
    return;
  }
  const btn = document.getElementById('side-cart-apply-coupon');
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.disabled = true;
  try {
    const { discountCents } = await applyPromoToMedusa(code, { requirePositiveDiscount: true });
    couponState.discountCents = discountCents;
    couponState.code = code;
    couponState.applied = true;
    setAppliedPromoCode(code);
    renderFeedback(`Cupom ${code} aplicado.`, 'success');
    renderCart();
  } catch {
    setAppliedPromoCode(null);
    couponState.discountCents = 0;
    couponState.applied = false;
    couponState.code = '';
    renderFeedback('Nao foi possivel aplicar este cupom.', 'error');
    renderCart();
  } finally {
    btn.disabled = false;
  }
});

// Checkout
document.getElementById('side-cart-checkout')?.addEventListener('click', async () => {
  await syncCartState();
  const items = getCartItems();
  if (!items.length) return;
  if (hasOutOfStock(items)) {
    renderFeedback('Remova itens sem estoque para finalizar a compra.', 'error');
    return;
  }
  const btn = document.getElementById('side-cart-checkout');
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = '...';
  try {
    if (import.meta.env.PUBLIC_MERCADOPAGO_PUBLIC_KEY) {
      window.location.href = '/checkout';
      return;
    }
    const cartId = await createMedusaCartFromLocalCart();
    const apiUrl = window.__API_URL__ || '/api/create-checkout';
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart_id: cartId }),
    });
    const data = await res.json();
    if (data.init_point) window.location.href = data.init_point;
    else throw new Error('No init_point');
  } catch {
    btn.disabled = false;
    btn.textContent = orig;
  }
});

// Primeiro render; em seguida recria o carrinho Medusa e re-aplica o cupom salvo (F5)
// Alterações no carrinho re-sincronizam o desconto após debounce
void (async () => {
  await syncCartState();
  renderCart();
  void rehydrateAppliedCoupon();
})();
window.addEventListener('cart:update', () => {
  renderCart();
  scheduleCouponResync();
});
}
