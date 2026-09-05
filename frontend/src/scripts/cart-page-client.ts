import { getCart, removeItem, updateQty, setQty, clearCart, getTotal, getAppliedPromoCode, setAppliedPromoCode, validateCartItems } from '../lib/cart';
import { createMedusaCartFromLocalCart } from '../lib/medusa-checkout-cart';
function fmt(cents: number) { return (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function escHtml(s: string) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function formatVariantLabel(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text.includes(':')) return text;
  const parts = text.split(/[\/|]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return text;
  return parts.map((value, idx) => `Opcao ${idx + 1}: ${value}`).join(' | ');
}
const couponState = { code: '', discountCents: 0, applied: false };
function hasOutOfStock(items: ReturnType<typeof getCart>) {
  return items.some((item: any) => item.stockState === 'out_of_stock');
}
async function syncCartState() {
  try {
    await validateCartItems();
  } catch {
    // Falha de rede não deve bloquear totalmente o carrinho.
  }
}
let couponResyncTimer: ReturnType<typeof setTimeout> | null = null;
function renderFeedback(message: string, tone: 'success' | 'error' | '') {
  const el = document.getElementById('cart-coupon-feedback');
  if (!(el instanceof HTMLElement)) return;
  if (!message) { el.hidden = true; el.textContent = ''; el.classList.remove('is-success', 'is-error'); return; }
  el.hidden = false; el.textContent = message;
  el.classList.toggle('is-success', tone === 'success');
  el.classList.toggle('is-error', tone === 'error');
}
async function fetchRegionId() {
  const base = '';
  const key = (window as any).__MEDUSA_PK__ || '';
  const res = await fetch(`${base}/store/regions?limit=1`, { headers: { 'x-publishable-api-key': key } });
  const data = await res.json();
  return data?.regions?.[0]?.id || null;
}
async function syncRemoteCart(items: Array<{ variantId: string; quantity: number }>) {
  const base = '';
  const key = (window as any).__MEDUSA_PK__ || '';
  const regionId = await fetchRegionId();
  if (!regionId) throw new Error('Sem regiao');
  const created = await fetch(`${base}/store/carts`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-publishable-api-key': key }, body: JSON.stringify({ region_id: regionId }) });
  const createdJson = await created.json();
  const cartId = createdJson?.cart?.id;
  if (!cartId) throw new Error('Sem cart id');
  for (const item of items) {
    await fetch(`${base}/store/carts/${cartId}/line-items`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-publishable-api-key': key }, body: JSON.stringify({ variant_id: item.variantId, quantity: item.quantity }) });
  }
  return { base, key, cartId };
}
function parseDiscountFromCart(cart: any, subtotalCents: number) {
  const total = Number(cart?.total ?? subtotalCents);
  const discountTotal = Number(cart?.discount_total ?? Math.max(0, subtotalCents - total));
  return Number.isFinite(discountTotal) && discountTotal > 0 ? Math.round(discountTotal) : 0;
}
async function applyPromoToMedusa(code: string, opts: { requirePositiveDiscount?: boolean } = {}) {
  const requirePositiveDiscount = opts.requirePositiveDiscount !== false;
  const items = getCart();
  if (!items.length) throw new Error('empty');
  const { base, key, cartId } = await syncRemoteCart(items);
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-publishable-api-key': key };
  let appliedResponse: any = null;
  const tryPromotion = await fetch(`${base}/store/carts/${cartId}/promotions`, { method: 'POST', headers, body: JSON.stringify({ promo_codes: [code] }) });
  if (tryPromotion.ok) appliedResponse = await tryPromotion.json();
  else {
    const fallback = await fetch(`${base}/store/carts/${cartId}`, { method: 'POST', headers, body: JSON.stringify({ promo_codes: [code] }) });
    if (fallback.ok) appliedResponse = await fallback.json();
  }
  const cart = appliedResponse?.cart;
  if (!cart) throw new Error('invalid');
  const discountCents = parseDiscountFromCart(cart, getTotal());
  if (requirePositiveDiscount && discountCents <= 0) throw new Error('no discount');
  return { discountCents };
}
/* true enquanto a validação de rede (syncCartState) ainda não rodou pela
   primeira vez nesta carga de página — controla o spinner (nunca mostra
   "vazio" nesse meio-tempo pra quem realmente tem item no carrinho). */
let validating = false;

/** Mostra/atualiza o botão "Ver mais" quando há mais de 3 itens — sanfona
 * simples (expande e recolhe), os itens extras continuam no DOM. */
function syncMoreToggle(body: HTMLElement, total: number) {
  let toggle = document.getElementById('cart-more-toggle');
  if (total <= 3) {
    toggle?.remove();
    body.classList.remove('sc-body--expanded');
    return;
  }
  if (!(toggle instanceof HTMLButtonElement)) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'cart-more-toggle';
    toggle.className = 'sc__more-toggle';
    toggle.addEventListener('click', () => {
      const expanded = body.classList.toggle('sc-body--expanded');
      toggle!.textContent = expanded ? 'Ver menos' : `Ver mais (${total - 3})`;
    });
    body.appendChild(toggle);
  } else {
    body.appendChild(toggle); // reordena pro fim (depois dos .sc-item recriados)
  }
  toggle.textContent = body.classList.contains('sc-body--expanded') ? 'Ver menos' : `Ver mais (${total - 3})`;
}

function render() {
  const body = document.getElementById('cart-items');
  const empty = document.getElementById('cart-empty');
  const loading = document.getElementById('cart-loading');
  if (!(body instanceof HTMLElement) || !(empty instanceof HTMLElement)) return;
  body.querySelectorAll('.sc-item').forEach((el) => el.remove());
  const items = getCart();
  if (loading instanceof HTMLElement) loading.hidden = !(validating && items.length > 0);
  empty.hidden = validating || items.length > 0;
  items.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = index >= 3 ? 'sc-item sc-item--extra' : 'sc-item';
    el.setAttribute('role', 'listitem');
    const titleH = escHtml(item.title || '');
    const variantH = item.variantTitle ? escHtml(formatVariantLabel(item.variantTitle)) : '';
    const thumb = item.thumbnail || '/logo.webp';
    const maxQtyRaw = Number(item.maxQuantity ?? 0);
    const maxQty = Number.isFinite(maxQtyRaw) && maxQtyRaw > 0 ? Math.floor(maxQtyRaw) : 9999;
    const isOutOfStock = (item as any).stockState === 'out_of_stock';
    el.innerHTML = `<div class="sc-item__head"><span class="sc-item__name">${titleH}</span></div><button class="sc-item__remove" type="button" data-id="${item.variantId}" data-action="remove" aria-label="Remover"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button><div class="sc-item__body"><div class="sc-item__img-wrap"><img class="sc-item__img" src="${thumb}" alt="" width="88" height="88" loading="lazy" decoding="async" /></div><div class="sc-item__right">${isOutOfStock ? '<div class="sc-item__stock">Esgotado</div>' : ''}${variantH ? `<div class="sc-item__variant">${variantH}</div>` : ''}<div class="sc-item__footer"><span class="sc-item__price">${fmt((item.price || 0) * (item.quantity || 1))}</span><div class="sc-item__stepper" role="group" aria-label="Quantidade"><button class="sc-item__stepper-btn" data-id="${item.variantId}" data-action="dec" type="button" ${isOutOfStock ? 'disabled' : ''}>−</button><input class="sc-item__stepper-input" data-id="${item.variantId}" data-action="set" type="number" min="1" max="${maxQty}" value="${item.quantity}" ${isOutOfStock ? 'disabled' : ''}/><button class="sc-item__stepper-btn" data-id="${item.variantId}" data-action="inc" type="button" ${isOutOfStock ? 'disabled' : ''}>+</button></div></div></div></div>`;
    body.appendChild(el);
  });
  syncMoreToggle(body, items.length);
  const subtotal = getTotal();
  const discount = Number(couponState.discountCents || 0);
  const total = Math.max(0, subtotal - discount);
  const savePct = subtotal > 0 && discount > 0 ? Math.round((discount / subtotal) * 100) : 0;
  const setText = (id: string, text: string) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  setText('cart-subtotal', fmt(subtotal));
  setText('cart-discount', `-${fmt(discount)}`);
  setText('cart-taxes', fmt(0));
  setText('cart-shipping', fmt(0));
  setText('cart-total', fmt(total));
  setText('cart-sticky-total', fmt(total));
  const saveTag = document.getElementById('cart-save-tag');
  if (saveTag) { saveTag.hidden = savePct <= 0; saveTag.textContent = `${savePct}% OFF`; }
  const checkoutDisabled = items.length === 0 || hasOutOfStock(items);
  const checkoutBtn = document.getElementById('cart-checkout');
  if (checkoutBtn instanceof HTMLButtonElement) checkoutBtn.disabled = checkoutDisabled;
  const stickyCheckoutBtn = document.getElementById('cart-sticky-checkout');
  if (stickyCheckoutBtn instanceof HTMLButtonElement) stickyCheckoutBtn.disabled = checkoutDisabled;
  renderFeedback(hasOutOfStock(items) ? 'Remova itens esgotados para finalizar a compra.' : '', hasOutOfStock(items) ? 'error' : '');
}
function scheduleCouponResync() {
  if (!getAppliedPromoCode() || !getCart().length) return;
  if (couponResyncTimer) clearTimeout(couponResyncTimer);
  couponResyncTimer = setTimeout(() => { couponResyncTimer = null; void rehydrateAppliedCoupon(); }, 500);
}
async function rehydrateAppliedCoupon() {
  const code = getAppliedPromoCode();
  const input = document.getElementById('cart-coupon');
  if (code && input instanceof HTMLInputElement) input.value = code;
  if (!code) return;
  if (!getCart().length) {
    setAppliedPromoCode(null);
    if (input instanceof HTMLInputElement) input.value = '';
    couponState.code = '';
    couponState.applied = false;
    couponState.discountCents = 0;
    render();
    return;
  }
  try {
    const { discountCents } = await applyPromoToMedusa(code, { requirePositiveDiscount: false });
    couponState.discountCents = discountCents; couponState.code = code; couponState.applied = true;
    setAppliedPromoCode(code); render();
  } catch {
    setAppliedPromoCode(null);
    couponState.discountCents = 0; couponState.applied = false; couponState.code = '';
    if (input instanceof HTMLInputElement) input.value = '';
    renderFeedback('Nao foi possivel recalcular o cupom. Tente aplicar de novo.', 'error'); render();
  }
}
document.getElementById('cart-items')?.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  const btn = target.closest('[data-id]');
  if (!(btn instanceof HTMLElement)) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (!id) return;
  if (action === 'remove') removeItem(id);
  if (action === 'inc') updateQty(id, 1);
  if (action === 'dec') updateQty(id, -1);
});
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
document.getElementById('cart-items')?.addEventListener('change', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.action !== 'set') return;
  commitManualQty(target);
});
document.getElementById('cart-items')?.addEventListener('keydown', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.action !== 'set') return;
  if (e.key !== 'Enter') return;
  e.preventDefault();
  commitManualQty(target);
});
document.getElementById('cart-clear-all')?.addEventListener('click', () => {
  clearCart();
  couponState.discountCents = 0; couponState.applied = false; couponState.code = '';
  setAppliedPromoCode(null);
  const input = document.getElementById('cart-coupon');
  if (input instanceof HTMLInputElement) input.value = '';
  renderFeedback('', '');
  render();
});
document.getElementById('cart-apply-coupon')?.addEventListener('click', async () => {
  const input = document.getElementById('cart-coupon');
  if (!(input instanceof HTMLInputElement)) return;
  const code = input.value.trim();
  if (!code) return renderFeedback('Digite um cupom para aplicar.', 'error');
  if (!getCart().length) return renderFeedback('Adicione produtos para aplicar cupom.', 'error');
  const btn = document.getElementById('cart-apply-coupon');
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.disabled = true;
  try {
    const { discountCents } = await applyPromoToMedusa(code, { requirePositiveDiscount: true });
    couponState.discountCents = discountCents; couponState.code = code; couponState.applied = true;
    setAppliedPromoCode(code); renderFeedback(`Cupom ${code} aplicado.`, 'success'); render();
  } catch {
    setAppliedPromoCode(null);
    couponState.discountCents = 0; couponState.applied = false; couponState.code = '';
    renderFeedback('Nao foi possivel aplicar este cupom.', 'error'); render();
  } finally {
    btn.disabled = false;
  }
});
document.getElementById('cart-checkout')?.addEventListener('click', async () => {
  await syncCartState();
  const items = getCart();
  if (!items.length) return;
  if (hasOutOfStock(items)) {
    renderFeedback('Remova itens esgotados para finalizar a compra.', 'error');
    return;
  }
  const btn = document.getElementById('cart-checkout');
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = '...';
  try {
    if ((window as any).__MERCADOPAGO_PK__) {
      window.location.href = '/checkout';
      return;
    }
    const cartId = await createMedusaCartFromLocalCart();
    const res = await fetch('/api/create-checkout', {
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
validating = getCart().length > 0;
render(); // pinta com o carrinho local na hora — nunca espera rede pro primeiro paint
if (validating) {
  await syncCartState();
  validating = false;
  render();
}
void rehydrateAppliedCoupon();

// ---- Resumo minimizado sticky (mobile) — mesmo padrão do #pdp-sticky-bar ----
document.getElementById('cart-sticky-checkout')?.addEventListener('click', () => {
  document.getElementById('cart-checkout')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
function ensureStickyDrawerClone() {
  const mount = document.getElementById('cart-sticky-drawer');
  const source = document.querySelector('.sc__footer.cart-footer');
  if (!(mount instanceof HTMLElement) || !source || mount.dataset.ready === '1') return;
  mount.appendChild(source.cloneNode(true));
  mount.dataset.ready = '1';
  // Clone é só apresentação — cliques nos botões/inputs dele disparam o
  // mesmo evento no elemento real, sem duplicar handler nenhum (ids
  // repetidos no clone nunca ficam "vivos": nada dentro dele tem listener
  // próprio, delegamos tudo pro original por data-id/seletor).
  mount.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const cloneBtn = target.closest('button, a');
    if (!cloneBtn) return;
    const id = cloneBtn.id;
    if (!id) return;
    ev.preventDefault();
    document.getElementById(id)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
const stickyMenuBtn = document.getElementById('cart-sticky-menu');
stickyMenuBtn?.addEventListener('click', () => {
  ensureStickyDrawerClone();
  const drawer = document.getElementById('cart-sticky-drawer');
  if (!(drawer instanceof HTMLElement)) return;
  const willOpen = drawer.hasAttribute('hidden');
  drawer.toggleAttribute('hidden', !willOpen);
  stickyMenuBtn.setAttribute('aria-expanded', String(willOpen));
  document.body.classList.toggle('cart-sticky-bar-expanded', willOpen);
});
const stickyBar = document.getElementById('cart-sticky-bar');
const summaryAside = document.querySelector('.cart-shell__summary');
if (stickyBar instanceof HTMLElement && summaryAside && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    ([entry]) => {
      const dock = !entry.isIntersecting;
      stickyBar.classList.toggle('cart-sticky-bar--docked', dock);
      stickyBar.classList.toggle('cart-sticky-bar--offscreen', !dock);
      stickyBar.setAttribute('aria-hidden', dock ? 'false' : 'true');
      document.body.classList.toggle('cart-sticky-bar-visible', dock);
      if (!dock) {
        document.body.classList.remove('cart-sticky-bar-expanded');
        document.getElementById('cart-sticky-drawer')?.setAttribute('hidden', '');
        stickyMenuBtn?.setAttribute('aria-expanded', 'false');
      }
    },
    { threshold: 0, rootMargin: '0px 0px -32px 0px' }
  );
  io.observe(summaryAside);
}
window.addEventListener('cart:update', () => {
  render();
  scheduleCouponResync();
});
// bfcache restore ou outra aba mudando o carrinho: revalida estoque de verdade,
// não só reflete o que já tava (pode estar desatualizado há um tempo).
window.addEventListener('pageshow', (e) => {
  if ((e as PageTransitionEvent).persisted) {
    void (async () => {
      await syncCartState();
      render();
    })();
  }
});
