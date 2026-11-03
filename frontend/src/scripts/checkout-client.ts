/**
 * Checkout transparente Mercado Pago — porta única (esta função) fala com:
 *  1. Medusa (cria carrinho real a partir do `tyer_cart` local, endereço, frete,
 *     payment collection/session) — igual ao resto do site.
 *  2. Mercado Pago SDK v2 (Secure Fields) SÓ pra tokenizar o cartão no browser
 *     — número/CVV nunca tocam nosso backend.
 *  3. Nossas 3 rotas store/checkout/mercadopago/{card,pix,boleto} — que fazem
 *     a cobrança de verdade — e a rota de status (polling p/ Pix/boleto).
 *
 * Layout: esquerda = endereço (trava depois de confirmado, vira resumo +
 * "Editar"), direita = resumo do pedido (dropdown) + pagamento, com um único
 * botão de ação embaixo que muda de comportamento conforme a etapa/aba atual.
 *
 * Toda troca de gateway futura muda isso aqui + o provider do Medusa, nunca
 * as páginas em volta.
 */
import { getCart, clearCart, type CartItem } from '../lib/cart';
import { fetchShippingQuote, isCep, linesSignature, readSavedShipping, renderShippingOptions, saveShipping, type ShipOption } from '../lib/shipping';
import { saveCheckoutDraft, loadCheckoutDraft, clearCheckoutDraft } from '../lib/checkout-draft';

declare global {
  interface Window {
    __MEDUSA_PK__?: string;
    __MERCADOPAGO_PK__?: string;
    __GOOGLE_MAPS_KEY__?: string;
    MercadoPago?: any;
  }
}

function medusaKey(): string {
  return (window.__MEDUSA_PK__ || '').trim();
}

function fmtBrl(amountMajor: number): string {
  return amountMajor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function qs<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function setText(id: string, text: string) {
  const el = qs(id);
  if (el) el.textContent = text;
}

function show(id: string, on = true) {
  const el = qs(id);
  if (el) el.hidden = !on;
}

/**
 * Dropdown custom (`.ck-select`) — mesmo comportamento de um `<select>`
 * nativo (clique/teclado abre, seta/Home/End navega, Enter/clique escolhe,
 * Esc/clique fora fecha), valor de verdade fica no `<input type="hidden">`
 * pra não mudar nada em quem já lê `qs('ck-installments')?.value`.
 */
function initCustomSelect(wrapId: string, btnId: string, listId: string, valueLabelId: string, hiddenInputId: string) {
  const wrap = qs(wrapId);
  const btn = qs<HTMLButtonElement>(btnId);
  const list = qs<HTMLUListElement>(listId);
  const valueLabel = qs(valueLabelId);
  const hiddenInput = qs<HTMLInputElement>(hiddenInputId);
  if (!wrap || !btn || !list || !valueLabel || !hiddenInput) return null;
  const getOptions = () => Array.from(list.querySelectorAll<HTMLLIElement>('[role="option"]'));

  /** Lista solta sobre a página (fixed): não cria rolagem nem é cortada pela coluna do resumo. */
  function place() {
    const r = btn!.getBoundingClientRect();
    const room = window.innerHeight - r.bottom - 12;
    const h = Math.min(list!.scrollHeight, 260);
    list!.style.position = 'fixed';
    list!.style.left = `${r.left}px`;
    list!.style.width = `${r.width}px`;
    list!.style.right = 'auto';
    list!.style.maxHeight = '260px';
    list!.style.top = room >= h || r.top < h ? `${r.bottom + 4}px` : `${r.top - h - 4}px`;
  }
  function close() {
    list!.hidden = true;
    btn!.setAttribute('aria-expanded', 'false');
  }
  function open() {
    list!.hidden = false;
    place();
    btn!.setAttribute('aria-expanded', 'true');
    (getOptions().find((o) => o.classList.contains('is-selected')) ?? getOptions()[0])?.focus();
  }
  function select(opt: HTMLLIElement) {
    getOptions().forEach((o) => {
      o.classList.toggle('is-selected', o === opt);
      o.setAttribute('aria-selected', o === opt ? 'true' : 'false');
    });
    valueLabel!.textContent = opt.dataset.short || opt.textContent || '';
    hiddenInput!.value = opt.dataset.value || '';
    hiddenInput!.dispatchEvent(new Event('change', { bubbles: true }));
    close();
    btn!.focus();
  }
  function bind(opt: HTMLLIElement) {
    opt.tabIndex = -1;
    opt.addEventListener('click', () => select(opt));
    opt.addEventListener('keydown', (ev) => {
      const options = getOptions();
      const idx = options.indexOf(opt);
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        options[Math.min(idx + 1, options.length - 1)]?.focus();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        options[Math.max(idx - 1, 0)]?.focus();
      } else if (ev.key === 'Home') {
        ev.preventDefault();
        options[0]?.focus();
      } else if (ev.key === 'End') {
        ev.preventDefault();
        options[options.length - 1]?.focus();
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        select(opt);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        close();
        btn!.focus();
      }
    });
  }

  btn.addEventListener('click', () => (list.hidden ? open() : close()));
  btn.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      open();
    }
  });
  getOptions().forEach(bind);
  document.addEventListener('click', (ev) => {
    if (!wrap!.contains(ev.target as Node)) close();
  });
  // A lista é fixed: acompanhar o botão (ou fechar) quando a página rola ou muda de tamanho.
  window.addEventListener('resize', () => !list!.hidden && place());
  window.addEventListener('scroll', (ev) => !list!.hidden && !list!.contains(ev.target as Node) && place(), true);

  return {
    /** Troca as opções (valor enviado, texto da lista e texto curto do botão) mantendo a escolha quando ainda existe. */
    setOptions(items: { value: string; label: string; short?: string }[]) {
      const keep = hiddenInput!.value;
      list!.replaceChildren();
      items.forEach((it) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.dataset.value = it.value;
        if (it.short) li.dataset.short = it.short;
        li.textContent = it.label;
        list!.appendChild(li);
        bind(li);
      });
      const chosen = getOptions().find((o) => o.dataset.value === keep) ?? getOptions()[0];
      if (chosen) {
        getOptions().forEach((o) => {
          o.classList.toggle('is-selected', o === chosen);
          o.setAttribute('aria-selected', o === chosen ? 'true' : 'false');
        });
        valueLabel!.textContent = chosen.dataset.short || chosen.textContent || '';
        hiddenInput!.value = chosen.dataset.value || '1';
      }
    },
  };
}

/** Setado depois do registro/login silencioso — associa carrinho/pedido ao customer. */
let currentAuthToken = '';

/**
 * Mesma chave/mesmo formato que Header.astro/account/* usam (`tyer_token` +
 * `tyer_customer` no localStorage) — sem isso a conta criada no checkout
 * fica presa só nesta aba: o resto do site (header, /account) continua
 * mostrando "visitante" mesmo com o customer já criado e logado.
 */
async function persistSiteSession(token: string) {
  currentAuthToken = token;
  try {
    localStorage.setItem('tyer_token', token);
    const res = await fetch('/store/customers/me', {
      headers: { authorization: `Bearer ${token}`, 'x-publishable-api-key': medusaKey() },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.customer) localStorage.setItem('tyer_customer', JSON.stringify(data.customer));
    }
  } catch {
    // Sessão local (checkout) já funciona via currentAuthToken; persistir
    // pro resto do site é um bônus, não pode travar a compra.
  }
}

async function medusaFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-publishable-api-key': medusaKey(),
      ...(currentAuthToken ? { authorization: `Bearer ${currentAuthToken}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error || `Erro ${res.status}`);
  return data;
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function renderSummary(items: CartItem[]) {
  const list = qs('checkout-summary-items');
  if (list) {
    list.innerHTML = items
      .map((item) => {
        const img = item.thumbnail
          ? `<img class="checkout-summary__item-img" src="${esc(item.thumbnail)}" alt="" loading="lazy" />`
          : '';
        const variantLine = [item.variantTitle ? `Tamanho: ${esc(item.variantTitle)}` : '', `x${Number(item.quantity) || 0}`]
          .filter(Boolean)
          .join(' · ');
        return `
          <div class="checkout-summary__item">
            <div class="checkout-summary__item-img-wrap">${img}</div>
            <div class="checkout-summary__item-info">
              <span class="checkout-summary__item-title">${esc(item.title)}</span>
              <span class="checkout-summary__item-variant">${variantLine}</span>
              <span class="checkout-summary__item-price">${fmtBrl((item.price * item.quantity) / 100)}</span>
            </div>
          </div>`;
      })
      .join('');
  }
  const subtotalCents = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  setText('checkout-summary-subtotal', fmtBrl(subtotalCents / 100));
  setText('checkout-summary-total', fmtBrl(subtotalCents / 100));
  setText('checkout-summary-toggle-total', fmtBrl(subtotalCents / 100));
}

function init() {
  const root = qs('checkout-root');
  if (!root) return;
  const t = (key: string) => root.dataset[key] || key;

  // Sessão de uma page load anterior (ex.: acabou de trocar a senha no
  // fluxo de reset e voltou pro checkout numa navegação nova — memória do
  // JS não sobrevive a isso, só o localStorage). Sem restaurar aqui,
  // `ensureAccount()` nunca vê `currentAuthToken` preenchido e tenta
  // registrar de novo, pedindo senha pra uma conta que já tem sessão.
  try {
    const savedToken = localStorage.getItem('tyer_token');
    if (savedToken) currentAuthToken = savedToken;
  } catch {
    /* storage indisponível: segue sem sessão restaurada */
  }

  const items = getCart();
  if (!items.length) {
    // Bag vazia não tem o que fazer no checkout — manda pra loja com um
    // aviso, em vez de deixar a pessoa presa numa página em branco.
    window.location.href = '/drop';
    return;
  }
  renderSummary(items);
  const installmentsSelect = initCustomSelect('ck-installments-select', 'ck-installments-btn', 'ck-installments-list', 'ck-installments-value', 'ck-installments');
  let payableTotal = 0;

  /** Parcelas do cartão, no formato do Mercado Livre: "3x de R$ 3,65 sem juros" ou "6x de R$ 2,00 (R$ 12,00)". */
  function renderInstallments(costs?: { installments: number; installment_rate: number; installment_amount: number; total_amount: number }[]) {
    if (!installmentsSelect) return;
    if (!costs?.length) {
      const label = payableTotal ? `1x de ${fmtBrl(payableTotal)} sem juros` : '1x';
      installmentsSelect.setOptions([{ value: '1', label }]);
      return;
    }
    installmentsSelect.setOptions(
      costs.map((c) => {
        const base = `${c.installments}x de ${fmtBrl(c.installment_amount)}`;
        const label = Number(c.installment_rate) === 0 ? `${base} sem juros` : `${base} (${fmtBrl(c.total_amount)})`;
        return { value: String(c.installments), label };
      })
    );
  }
  renderInstallments();

  // ---- Frete: opções (preço e prazo) calculadas no servidor para o CEP digitado ----
  let shipChoice: ShipOption | null = null;
  let shipFor = '';
  let shipTimer: ReturnType<typeof setTimeout> | null = null;

  /** Mostra o frete escolhido nos totais assim que ele é escolhido; o valor oficial vem do carrinho ao confirmar. */
  function previewShippingTotals() {
    const subtotalCents = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    if (!shipChoice) {
      show('checkout-summary-shipping-row', false);
      setText('checkout-summary-total', fmtBrl(subtotalCents / 100));
      setText('checkout-summary-toggle-total', fmtBrl(subtotalCents / 100));
      return;
    }
    setText('checkout-summary-shipping', fmtBrl(shipChoice.price));
    show('checkout-summary-shipping-row', true);
    setText('checkout-summary-total', fmtBrl(subtotalCents / 100 + shipChoice.price));
    setText('checkout-summary-toggle-total', fmtBrl(subtotalCents / 100 + shipChoice.price));
  }

  async function refreshShipping() {
    const zip = (qs<HTMLInputElement>('ck-zip')?.value || '').trim();
    const box = qs('ck-shipping');
    const hint = qs('ck-ship-hint');
    const list = qs('ck-ship-options');
    if (!box || !hint || !list) return;
    if (!isCep(zip)) {
      shipChoice = null;
      shipFor = '';
      box.hidden = true;
      previewShippingTotals();
      return;
    }
    const lines = items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity }));
    const key = `${zip}|${linesSignature(lines)}`;
    if (key === shipFor && shipChoice) return;
    box.hidden = false;
    hint.textContent = 'Calculando o frete…';
    list.replaceChildren();
    try {
      const quote = await fetchShippingQuote(zip, lines);
      if ((qs<HTMLInputElement>('ck-zip')?.value || '').trim() !== zip) return;
      const savedId = readSavedShipping()?.id;
      shipChoice = quote.options.find((o) => o.id === (shipChoice?.id ?? savedId)) ?? quote.options[0] ?? null;
      shipFor = key;
      hint.textContent = shipChoice ? '' : 'Nenhum serviço de entrega atende este CEP.';
      previewShippingTotals();
      renderShippingOptions(list, quote, {
        name: 'ck-ship',
        selectedId: shipChoice?.id,
        onSelect: (o) => {
          shipChoice = o;
          saveShipping({ cep: zip, id: o.id, name: o.name, price: o.price, signature: linesSignature(lines) });
          previewShippingTotals();
        },
      });
    } catch (err) {
      shipChoice = null;
      shipFor = '';
      previewShippingTotals();
      hint.textContent = err instanceof Error ? err.message : 'Não foi possível calcular o frete agora.';
    }
  }
  const zipField = qs<HTMLInputElement>('ck-zip');
  const scheduleShipping = () => {
    if (shipTimer) clearTimeout(shipTimer);
    shipTimer = setTimeout(() => void refreshShipping(), 400);
  };
  /**
   * Autocompletar do Google (Places) no campo "Endereço": ao escolher uma sugestão, preenche endereço, número, bairro,
   * cidade, UF e CEP. Sem chave configurada, ou se o Google não carregar, o cliente digita tudo à mão.
   */
  function initAddressAutocomplete() {
    const key = (window.__GOOGLE_MAPS_KEY__ || '').trim();
    const streetInput = qs<HTMLInputElement>('ck-street');
    if (!key || !streetInput || document.getElementById('gmaps-sdk')) return;
    const start = () => {
      const g = (window as any).google;
      if (!g?.maps?.places) return;
      const auto = new g.maps.places.Autocomplete(streetInput, {
        componentRestrictions: { country: 'br' },
        fields: ['address_components', 'place_id'],
        types: ['address'],
      });
      auto.addListener('place_changed', () => {
        const parts: { long_name: string; short_name: string; types: string[] }[] = auto.getPlace()?.address_components ?? [];
        const get = (type: string, short = false) => {
          const p = parts.find((c) => c.types.includes(type));
          return p ? (short ? p.short_name : p.long_name) : '';
        };
        const put = (id: string, value: string) => {
          const el = qs<HTMLInputElement>(id);
          if (el && value) el.value = value;
        };
        put('ck-street', get('route'));
        put('ck-number', get('street_number'));
        put('ck-neighborhood', get('sublocality_level_1') || get('sublocality') || get('neighborhood') || get('political'));
        put('ck-city', get('administrative_area_level_2') || get('locality'));
        put('ck-province', get('administrative_area_level_1', true));
        const applyZip = (zip: string) => {
          if (!zip) return;
          put('ck-zip', zip);
          qs<HTMLInputElement>('ck-zip')?.dispatchEvent(new Event('input', { bubbles: true }));
          scheduleShipping();
        };
        applyZip(get('postal_code'));
        // Sem CEP no resultado (rua sem número, por exemplo): o Geocoder devolve o CEP do mesmo lugar.
        const placeId = auto.getPlace()?.place_id;
        if (!get('postal_code') && placeId && g.maps.Geocoder) {
          new g.maps.Geocoder().geocode({ placeId }, (res: any[] | null, status: string) => {
            const zip = status === 'OK' ? res?.[0]?.address_components?.find((c: any) => c.types.includes('postal_code'))?.long_name : '';
            applyZip(zip || '');
          });
        }
        qs<HTMLInputElement>(get('street_number') ? 'ck-complement' : 'ck-number')?.focus();
      });
    };
    const script = document.createElement('script');
    script.id = 'gmaps-sdk';
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=pt-BR&region=BR`;
    script.addEventListener('load', start);
    document.head.appendChild(script);
  }
  initAddressAutocomplete();
  zipField?.addEventListener('input', scheduleShipping);
  zipField?.addEventListener('change', scheduleShipping);

  // Pré-preenche o CEP se o cliente já digitou na PDP (evita perguntar de
  // novo — "Comprar agora" pula direto pra cá).
  try {
    const lastCep = localStorage.getItem('tyer_last_cep');
    const zipInput = qs<HTMLInputElement>('ck-zip');
    if (lastCep && zipInput && !zipInput.value) zipInput.value = lastCep;
  } catch {
    /* storage indisponível: segue sem pré-preencher */
  }

  void refreshShipping();

  const setIfEmpty = (id: string, value: string | undefined | null) => {
    const el = qs<HTMLInputElement>(id);
    if (el && !el.value && value) el.value = value;
  };

  // Rascunho salvo (ex.: voltando do fluxo de "esqueci minha senha", que
  // pode abrir numa aba nova a partir do link do e-mail) — pré-preenche
  // sem perguntar de novo. Nunca inclui senha.
  const draft = loadCheckoutDraft();
  if (draft) {
    setIfEmpty('ck-email', draft.email);
    setIfEmpty('ck-first-name', draft.first_name);
    setIfEmpty('ck-last-name', draft.last_name);
    setIfEmpty('ck-cpf', draft.cpf);
    setIfEmpty('ck-phone', draft.phone);
    setIfEmpty('ck-zip', draft.zip_code);
    scheduleShipping();
    setIfEmpty('ck-street', draft.street_name);
    setIfEmpty('ck-number', draft.street_number);
    setIfEmpty('ck-neighborhood', draft.neighborhood);
    setIfEmpty('ck-complement', draft.complement);
    setIfEmpty('ck-city', draft.city);
    setIfEmpty('ck-province', draft.federal_unit);
  }

  let cartId = '';
  let paymentSessionId = '';
  let pollTimer: number | null = null;
  let mp: any = null;
  let cardFields: { number: any; expiration: any; cvv: any } | null = null;
  let detectedPaymentMethodId = '';
  /** 'address' = ainda editando endereço · 'payment' = travado, pagamento liberado. */
  let stage: 'address' | 'payment' = 'address';
  let paymentDone = false; // Pix/boleto gerados: espera confirmação, CTA fica desativado
  let needsLogin = false; // e-mail já tem conta — pede senha em vez de criar de novo

  /**
   * Passo visual do wizard mobile — independente de `stage` (que já controla
   * o fluxo real de endereço/pagamento e fica igual no desktop). No desktop
   * as 2 colunas mostram tudo de uma vez; isso só importa dentro do
   * `@media (max-width:860px)` do checkout.astro, então setar em qualquer
   * largura de tela é inofensivo — só os consumidores (CSS + o próprio CTA)
   * checam a largura antes de agir diferente.
   */
  let mobileStep: 'contact' | 'address' | 'review' | 'payment' = 'contact';
  function isMobileWizard(): boolean {
    return window.matchMedia('(max-width: 860px)').matches;
  }
  const MOBILE_STEP_LABELS: Record<typeof mobileStep, string> = {
    contact: 'Passo 1 de 3 — Seus dados',
    address: 'Passo 2 de 3 — Endereço e entrega',
    review: 'Passo 3 de 3 — Revisão e pagamento',
    payment: 'Passo 3 de 3 — Revisão e pagamento',
  };
  function setMobileStep(next: typeof mobileStep) {
    mobileStep = next;
    root.dataset.mobileStep = next;
    setText('checkout-mobile-step-label', MOBILE_STEP_LABELS[next]);
    // Revisão e pagamento são o mesmo passo para quem preenche: 3 passos (dados, endereço e entrega, pagamento).
    const stepNumber = next === 'contact' ? 1 : next === 'address' ? 2 : 3;
    const pct = Math.round((stepNumber / 3) * 100);
    const fill = qs('checkout-mobile-stepper-fill');
    if (fill) fill.style.width = `${pct}%`;
    setText('checkout-mobile-stepper-pct', `${pct}%`);
    syncCta();
  }

  function stopPolling() {
    if (pollTimer != null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /** Mostra o número do pedido, o que foi comprado e o total na tela de agradecimento. */
  function fillSuccess(order: any) {
    if (!order) return;
    const money = (v: number) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: String(order.currency_code || 'brl').toUpperCase() });
    const num = qs('checkout-success-order');
    if (num && order.display_id) {
      num.textContent = `Pedido #${order.display_id}`;
      num.hidden = false;
    }
    const list = qs('checkout-success-items');
    if (list) {
      list.replaceChildren(
        ...(order.items ?? []).map((i: any) => {
          const li = document.createElement('li');
          const name = document.createElement('span');
          name.textContent = `${i.quantity}x ${i.title}`;
          const price = document.createElement('span');
          price.textContent = money(i.unit_price * i.quantity);
          li.append(name, price);
          return li;
        })
      );
    }
    const total = qs('checkout-success-total');
    if (total && order.total != null) {
      total.textContent = `Total: ${money(order.total)}`;
      total.hidden = false;
    }
    const mail = qs('checkout-success-mail');
    if (mail && order.email) {
      mail.textContent = `Enviamos a confirmação para ${order.email}.`;
      mail.hidden = false;
      const spam = qs('checkout-success-spam');
      if (spam) spam.hidden = false;
    }
  }

  /** Aviso central animado (barra + bola) durante as etapas demoradas; as mensagens se revezam enquanto espera. */
  let busyTimer: ReturnType<typeof setInterval> | null = null;
  function startBusy(messages: string[]) {
    const box = qs('checkout-busy');
    if (!box) return;
    let i = 0;
    setText('checkout-busy-text', messages[0] ?? '');
    box.hidden = false;
    if (busyTimer) clearInterval(busyTimer);
    if (messages.length > 1) {
      busyTimer = setInterval(() => {
        i = Math.min(i + 1, messages.length - 1);
        setText('checkout-busy-text', messages[i]);
      }, 2200);
    }
  }
  function stopBusy() {
    if (busyTimer) clearInterval(busyTimer);
    busyTimer = null;
    const box = qs('checkout-busy');
    if (box) box.hidden = true;
  }

  async function completeCart() {
    // Rota própria: a original responde 409 enquanto o pedido ainda está sendo concluído em compras simultâneas.
    const data = await medusaFetch('/store/checkout/complete', { method: 'POST', body: JSON.stringify({ cart_id: cartId }) });
    if (data?.type === 'order') {
      stopPolling();
      clearCart();
      clearCheckoutDraft();
      show('checkout-form-section', false);
      const panel = qs('checkout-summary-panel');
      if (panel) panel.hidden = true;
      const lock = qs('checkout-lock-indicator');
      if (lock) lock.hidden = true;
      fillSuccess(data.order);
      show('checkout-success', true);
      return true;
    }
    return false;
  }

  function startPolling(onAuthorized: () => void) {
    stopPolling();
    pollTimer = window.setInterval(async () => {
      try {
        const data = await medusaFetch(
          `/store/checkout/mercadopago/status?payment_session_id=${encodeURIComponent(paymentSessionId)}`
        );
        if (data.status === 'authorized') {
          stopPolling();
          onAuthorized();
        }
      } catch {
        /* tenta de novo no próximo tick */
      }
    }, 4000);
  }

  function payerFromForm() {
    return {
      email: (qs<HTMLInputElement>('ck-email')?.value || '').trim(),
      first_name: (qs<HTMLInputElement>('ck-first-name')?.value || '').trim(),
      last_name: (qs<HTMLInputElement>('ck-last-name')?.value || '').trim(),
      cpf: (qs<HTMLInputElement>('ck-cpf')?.value || '').trim().replace(/\D/g, ''),
    };
  }

  function addressFromForm() {
    return {
      zip_code: (qs<HTMLInputElement>('ck-zip')?.value || '').trim(),
      street_name: (qs<HTMLInputElement>('ck-street')?.value || '').trim(),
      street_number: (qs<HTMLInputElement>('ck-number')?.value || '').trim(),
      neighborhood: (qs<HTMLInputElement>('ck-neighborhood')?.value || '').trim(),
      complement: (qs<HTMLInputElement>('ck-complement')?.value || '').trim(),
      city: (qs<HTMLInputElement>('ck-city')?.value || '').trim(),
      federal_unit: (qs<HTMLInputElement>('ck-province')?.value || '').trim(),
    };
  }

  /**
   * Endereço salvo na conta (Medusa `GET/POST /store/customers/me/addresses`
   * — campos nativos, sem "bairro"; guardamos ele em `metadata.neighborhood`).
   */
  type SavedAddress = {
    id: string;
    first_name?: string;
    last_name?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    province?: string;
    postal_code?: string;
    phone?: string;
    is_default_shipping?: boolean;
    metadata?: { neighborhood?: string; complement?: string } | null;
  };
  let customerAddresses: SavedAddress[] = [];

  /** Mesmo endereço digitado de formas diferentes (CEP com ou sem hífen, caixa, espaços) conta como um só. */
  function addressKey(zip?: string | null, street?: string | null, number?: string | null) {
    const norm = (v?: string | null) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
    return `${String(zip || '').replace(/\D/g, '')}|${norm(street)}|${norm(number)}`;
  }

  function fillAddressFields(addr: SavedAddress) {
    const map: Record<string, string> = {
      'ck-zip': addr.postal_code || '',
      'ck-street': addr.address_1 || '',
      'ck-number': addr.address_2 || '',
      'ck-neighborhood': addr.metadata?.neighborhood || '',
      'ck-complement': addr.metadata?.complement || '',
      'ck-city': addr.city || '',
      'ck-province': addr.province || '',
    };
    Object.entries(map).forEach(([id, value]) => {
      const el = qs<HTMLInputElement>(id);
      if (el) el.value = value;
    });
    scheduleShipping();
  }

  /** Passo 2 (endereço) — cliente logado com endereço(s) salvos: cards em
   * vez do form cru. Clicar num card só seleciona e preenche os inputs de
   * verdade por baixo — o "Avançar" continua sendo o CTA único do resumo
   * (`stage==='address'` → `submitAddress()`), sem botão novo. */
  /** Endereço salvo escolhido nos cartões e, quando a pessoa está editando ou criando um, qual é (null = novo). */
  let selectedAddressId: string | null = null;
  let editingAddressId: string | null = null;

  function setEditMode(on: boolean) {
    show('checkout-address-edit-actions', on);
    show('checkout-address-edit-error', false);
  }

  function renderAddressCards(addresses: SavedAddress[], selectId?: string | null) {
    const wrap = qs('checkout-address-cards');
    if (!wrap || !addresses.length) return;
    wrap.innerHTML = '';
    const seen = new Set<string>();
    const sorted = [...addresses]
      .sort((a, b) => (b.is_default_shipping ? 1 : 0) - (a.is_default_shipping ? 1 : 0))
      .filter((a) => {
        const key = addressKey(a.postal_code, a.address_1, a.address_2);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const picked = sorted.find((a) => a.id === (selectId ?? selectedAddressId)) ?? null;
    sorted.forEach((addr) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'checkout-address-card' + (addr.id === (picked?.id ?? sorted[0].id) ? ' is-selected' : '');
      card.dataset.addressId = addr.id;
      const name = `${addr.first_name || ''} ${addr.last_name || ''}`.trim();
      const line2 = [addr.metadata?.complement, addr.metadata?.neighborhood].filter(Boolean).map((v) => ` — ${v}`).join('');
      card.innerHTML = `
        ${addr.is_default_shipping ? '<span class="checkout-address-card__badge">Padrão</span>' : ''}
        <p class="checkout-address-card__name">${esc(name)}</p>
        <p class="checkout-address-card__lines">${esc(addr.address_1)}, ${esc(addr.address_2)}${esc(line2)}<br>${esc(addr.city)} - ${esc(addr.province)} · ${esc(addr.postal_code)}</p>
      `;
      card.addEventListener('click', () => {
        wrap.querySelectorAll('.checkout-address-card').forEach((c) => c.classList.remove('is-selected'));
        card.classList.add('is-selected');
        selectedAddressId = addr.id;
        fillAddressFields(addr);
      });
      wrap.appendChild(card);
    });
    const current = picked ?? sorted[0];
    selectedAddressId = current.id;
    fillAddressFields(current);
    show('checkout-address-summary', true);
    show('checkout-address-fields', false);
    setEditMode(false);
  }

  // Edita o endereço escolhido: mostra os campos já preenchidos com ele em vez de limpar tudo.
  qs('checkout-address-summary-edit')?.addEventListener('click', () => {
    editingAddressId = selectedAddressId;
    show('checkout-address-summary', false);
    show('checkout-address-fields', true);
    setEditMode(true);
    qs<HTMLInputElement>('ck-street')?.focus();
  });

  qs('checkout-address-summary-new')?.addEventListener('click', () => {
    ['ck-zip', 'ck-street', 'ck-number', 'ck-complement', 'ck-neighborhood', 'ck-city', 'ck-province'].forEach((id) => {
      const el = qs<HTMLInputElement>(id);
      if (el) el.value = '';
    });
    show('checkout-address-summary', false);
    show('checkout-address-fields', true);
    editingAddressId = null;
    setEditMode(true);
    qs<HTMLInputElement>('ck-street')?.focus();
  });

  // Cancelar volta aos endereços salvos, com o escolhido como estava (descarta o que foi digitado).
  qs('checkout-address-cancel')?.addEventListener('click', () => {
    const back = customerAddresses.find((x) => x.id === selectedAddressId) ?? customerAddresses[0];
    if (!back) return;
    fillAddressFields(back);
    show('checkout-address-fields', false);
    show('checkout-address-summary', true);
    setEditMode(false);
  });

  // Salvar grava a edição (ou o endereço novo) na conta e volta aos cartões, sem precisar seguir para o pagamento.
  qs('checkout-address-save')?.addEventListener('click', async () => {
    if (!validateRequiredFields(['ck-zip', 'ck-street', 'ck-number', 'ck-city', 'ck-province'])) return;
    const btn = qs<HTMLButtonElement>('checkout-address-save');
    const addr = addressFromForm();
    const body = {
      address_1: addr.street_name,
      address_2: addr.street_number,
      city: addr.city,
      province: addr.federal_unit,
      postal_code: addr.zip_code,
      country_code: 'br',
      metadata: { neighborhood: addr.neighborhood || undefined, complement: addr.complement || undefined },
    };
    if (btn) btn.disabled = true;
    show('checkout-address-edit-error', false);
    try {
      const creating = !editingAddressId;
      await medusaFetch(creating ? '/store/customers/me/addresses' : `/store/customers/me/addresses/${editingAddressId}`, {
        method: 'POST',
        body: JSON.stringify(
          creating
            ? {
                ...body,
                first_name: (qs<HTMLInputElement>('ck-first-name')?.value || '').trim(),
                last_name: (qs<HTMLInputElement>('ck-last-name')?.value || '').trim(),
                phone: (qs<HTMLInputElement>('ck-phone')?.value || '').trim() || undefined,
                is_default_shipping: customerAddresses.length === 0,
              }
            : body
        ),
      });
      const me = await medusaFetch('/store/customers/me');
      customerAddresses = Array.isArray(me?.customer?.addresses) ? me.customer.addresses : customerAddresses;
      const key = addressKey(addr.zip_code, addr.street_name, addr.street_number);
      const saved = creating ? customerAddresses.find((x) => addressKey(x.postal_code, x.address_1, x.address_2) === key) : null;
      renderAddressCards(customerAddresses, saved?.id ?? editingAddressId);
    } catch (err) {
      setText('checkout-address-edit-error', err instanceof Error ? err.message : 'Não foi possível salvar o endereço.');
      show('checkout-address-edit-error', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  /** Passo 1 (dados) — cliente logado com nome/e-mail já conhecidos: card
   * resumo em vez do form cru. Inputs continuam preenchidos por baixo. */
  function renderContactSummary(customer: { first_name?: string; last_name?: string; email?: string }) {
    setText('checkout-contact-summary-name', `${customer.first_name || ''} ${customer.last_name || ''}`.trim());
    setText('checkout-contact-summary-email', customer.email || '');
    show('checkout-contact-summary', true);
    show('checkout-contact-fields', false);
  }
  qs('checkout-contact-summary-edit')?.addEventListener('click', () => {
    show('checkout-contact-summary', false);
    show('checkout-contact-fields', true);
  });

  /**
   * Sessão já restaurada (`currentAuthToken`) — busca dados de conta pra
   * pular os forms crus (cartão-resumo no passo 1, cards de endereço no
   * passo 2), em vez de pedir pra digitar tudo de novo pra quem já é
   * cliente. Sem sessão, ou API fora do ar, os forms crus continuam sendo
   * o único caminho — nunca trava o checkout por causa disso.
   */
  async function loadAccountData() {
    if (!currentAuthToken) return;
    try {
      const res = await fetch('/store/customers/me', {
        headers: { authorization: `Bearer ${currentAuthToken}`, 'x-publishable-api-key': medusaKey() },
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const customer = data?.customer;
      if (!customer) return;
      try {
        localStorage.setItem('tyer_customer', JSON.stringify(customer));
      } catch {
        /* localStorage indisponível — sessão em memória já basta pra esta page load */
      }

      // O e-mail da conta é o que dá acesso à pré-venda: logado, ele vem preenchido e não pode ser trocado por outro.
      if (customer.email) {
        const emailInput = qs<HTMLInputElement>('ck-email');
        if (emailInput) {
          emailInput.value = customer.email;
          emailInput.readOnly = true;
          emailInput.setAttribute('aria-readonly', 'true');
        }
        setIfEmpty('ck-first-name', customer.first_name);
        setIfEmpty('ck-last-name', customer.last_name);
        setIfEmpty('ck-phone', customer.phone);
        if (customer.metadata?.cpf) setIfEmpty('ck-cpf', String(customer.metadata.cpf));
        if (customer.first_name && customer.last_name) renderContactSummary(customer);
      }

      customerAddresses = Array.isArray(customer.addresses) ? customer.addresses : [];
      if (customerAddresses.length) renderAddressCards(customerAddresses);
    } catch {
      /* rede fora do ar — segue com os forms crus, não trava o checkout */
    }
  }
  void loadAccountData();

  /** Persiste o endereço confirmado na conta do cliente (best-effort, nunca
   * bloqueia o checkout) — sem isso o endereço digitado só valia pro pedido
   * atual, nunca ficava disponível pra próxima compra. Não duplica se já
   * for igual a um endereço salvo (mesmo CEP+rua+número). */
  async function persistAddressToAccount(addr: ReturnType<typeof addressFromForm>, payer: ReturnType<typeof payerFromForm>) {
    if (!currentAuthToken) return;
    const alreadySaved = customerAddresses.some(
      (a) => addressKey(a.postal_code, a.address_1, a.address_2) === addressKey(addr.zip_code, addr.street_name, addr.street_number)
    );
    if (alreadySaved) return;
    try {
      await fetch('/store/customers/me/addresses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${currentAuthToken}`,
          'x-publishable-api-key': medusaKey(),
        },
        body: JSON.stringify({
          first_name: payer.first_name,
          last_name: payer.last_name,
          address_1: addr.street_name,
          address_2: addr.street_number,
          city: addr.city,
          province: addr.federal_unit,
          postal_code: addr.zip_code,
          country_code: 'br',
          phone: (qs<HTMLInputElement>('ck-phone')?.value || '').trim() || undefined,
          metadata: addr.neighborhood || addr.complement ? { neighborhood: addr.neighborhood || undefined, complement: addr.complement || undefined } : undefined,
          is_default_shipping: customerAddresses.length === 0,
        }),
      });
    } catch {
      /* best-effort — endereço já foi usado no pedido atual de qualquer forma */
    }
  }

  /** Só os campos do passo 1 (dados pessoais) — usado pelo "Continuar" do
   * wizard mobile pra avançar pro passo 2 sem exigir endereço ainda. */
  function personalFormValid() {
    const payer = payerFromForm();
    return Boolean(payer.email && payer.first_name && payer.last_name && payer.cpf.length === 11);
  }

  // Erro por campo (asterisco já marca quais são obrigatórios no HTML) —
  // em vez de só um aviso genérico embaixo do form, mostra exatamente qual
  // input falta e foca o primeiro.
  const REQUIRED_FIELD_MESSAGES: Record<string, string> = {
    'ck-email': 'Digite seu e-mail.',
    'ck-first-name': 'Digite seu nome.',
    'ck-last-name': 'Digite seu sobrenome.',
    'ck-cpf': 'CPF inválido — precisa ter 11 dígitos.',
    'ck-zip': 'Digite o CEP.',
    'ck-street': 'Digite o endereço.',
    'ck-number': 'Digite o número.',
    'ck-city': 'Digite a cidade.',
    'ck-province': 'Digite o estado (UF).',
  };
  function setFieldError(id: string, message: string | null) {
    const input = qs<HTMLInputElement>(id);
    const errorEl = document.querySelector(`[data-error-for="${id}"]`);
    const field = input?.closest('.checkout-field');
    field?.classList.toggle('is-invalid', !!message);
    if (errorEl instanceof HTMLElement) {
      errorEl.hidden = !message;
      errorEl.textContent = message || '';
    }
  }
  function fieldIsValid(id: string): boolean {
    const value = (qs<HTMLInputElement>(id)?.value || '').trim();
    if (id === 'ck-cpf') return value.replace(/\D/g, '').length === 11;
    return value.length > 0;
  }
  /** Marca cada campo obrigatório vazio/inválido com erro próprio, foca o
   * primeiro. Devolve se está tudo certo. */
  function validateRequiredFields(ids: string[]): boolean {
    let firstInvalidId: string | null = null;
    ids.forEach((id) => {
      const valid = fieldIsValid(id);
      setFieldError(id, valid ? null : REQUIRED_FIELD_MESSAGES[id] || 'Campo obrigatório.');
      if (!valid && !firstInvalidId) firstInvalidId = id;
    });
    if (firstInvalidId) qs<HTMLInputElement>(firstInvalidId)?.focus();
    return !firstInvalidId;
  }
  // Erro individual some assim que a pessoa começa a corrigir o campo.
  Object.keys(REQUIRED_FIELD_MESSAGES).forEach((id) => {
    qs(id)?.addEventListener('input', () => setFieldError(id, null));
  });

  // Voltando de "esqueci minha senha" (ou qualquer reload com rascunho já
  // completo): não faz sentido mostrar o passo 1 de novo com tudo já
  // preenchido — pula direto pro passo 2, só falta clicar em continuar.
  // (Endereço/pagamento em si não retomam sozinhos — cartId/payment session
  // são efêmeros, ficaram na page load anterior — mas os dados não se
  // perdem, e a sessão restaurada acima evita pedir senha de novo.)
  if (draft && personalFormValid()) {
    setMobileStep('address');
  }

  function randomPassword(): string {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '');
  }

  /**
   * Cria conta + sessão sozinho (sem pedir senha) — se o e-mail já tiver
   * conta, pede a senha em vez de tentar recriar. O reset (link "esqueci
   * senha") acontece depois, pelo e-mail de confirmação do pedido.
   */
  async function ensureAccount(): Promise<boolean> {
    // Sessão já estabelecida nesta page load (ex.: voltou de "Editar" e tá
    // reenviando) — sem isso, todo reenvio tentava registrar de novo, a
    // Medusa recusava ("already exists") e pedia senha de uma conta que a
    // própria sessão atual já é dona.
    if (currentAuthToken) return true;
    const payer = payerFromForm();
    if (needsLogin) {
      const password = (qs<HTMLInputElement>('ck-login-password')?.value || '').trim();
      if (!password) {
        setText('checkout-contact-error', 'Digite sua senha.');
        show('checkout-contact-error', true);
        return false;
      }
      try {
        const res = await medusaFetch('/auth/customer/emailpass', {
          method: 'POST',
          body: JSON.stringify({ email: payer.email, password }),
        });
        await persistSiteSession(res.token);
        return true;
      } catch {
        setText('checkout-contact-error', 'Senha incorreta.');
        show('checkout-contact-error', true);
        return false;
      }
    }

    try {
      const password = randomPassword();
      const reg = await medusaFetch('/auth/customer/emailpass/register', {
        method: 'POST',
        body: JSON.stringify({ email: payer.email, password }),
      });
      await medusaFetch('/store/customers', {
        method: 'POST',
        headers: { authorization: `Bearer ${reg.token}` },
        body: JSON.stringify({
          email: payer.email,
          first_name: payer.first_name,
          last_name: payer.last_name,
          phone: (qs<HTMLInputElement>('ck-phone')?.value || '').trim() || undefined,
          // CPF não tem campo nativo no customer da Medusa — guardado em
          // metadata pra poder pré-preencher o passo 1 num checkout futuro
          // (card-resumo de conta já logada), sem pedir de novo.
          metadata: payer.cpf ? { cpf: payer.cpf } : undefined,
        }),
      });
      // token do registro não carrega customer_id ainda — login pra pegar a sessão de verdade
      const login = await medusaFetch('/auth/customer/emailpass', {
        method: 'POST',
        body: JSON.stringify({ email: payer.email, password }),
      }).catch(() => null);
      if (login?.token) await persistSiteSession(login.token);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/already exists/i.test(msg)) {
        needsLogin = true;
        show('checkout-login-needed', true);
        setText('checkout-contact-error', '');
        show('checkout-contact-error', false);
        return false;
      }
      // Conta é um bônus, não pode travar a compra se a criação falhar por
      // outro motivo (rede, etc) — segue sem conta associada.
      currentAuthToken = '';
      return true;
    }
  }

  function activePaymentTab(): string {
    return document.querySelector<HTMLButtonElement>('[data-payment-tab].is-active')?.dataset.paymentTab || 'card';
  }

  /**
   * Rótulo "Pagar R$X" só é conhecido no momento em que `submitAddress()`
   * lê o total do cart Medusa — cacheado aqui em vez de passado direto pra
   * `syncCta()`, porque no wizard mobile essa mesma função é chamada de
   * novo (sem esse valor) ao trocar de passo (review→payment→review...),
   * e sem o cache o texto ficava travado em "Continuar para pagamento".
   */
  let cachedPayLabel = '';

  /** O botão único embaixo do resumo muda de rótulo conforme a etapa/aba atual. */
  function syncCta() {
    const cta = qs<HTMLButtonElement>('checkout-summary-cta');
    if (!cta) return;
    if (paymentDone) {
      cta.disabled = true;
      cta.textContent = t('processing') === 'processing' ? 'Aguardando pagamento…' : t('processing');
      return;
    }
    cta.disabled = false;
    /* Wizard mobile passo 1 (dados pessoais): CTA só avança pro passo 2
       (endereço), nunca submete o form inteiro — isso só acontece no
       passo 2 de verdade (stage ainda 'address', mas mobileStep já
       'address' nesse ponto). */
    if (isMobileWizard() && mobileStep === 'contact') {
      cta.textContent = 'Continuar';
      return;
    }
    if (stage === 'address') {
      cta.textContent = t('continueToPayment');
      return;
    }
    /* Wizard mobile: endereço já travou (`stage` virou 'payment' de verdade
       assim que a sessão de pagamento existe), mas visualmente ainda tá no
       passo 2 (revisão) — o CTA só deve avançar de passo, não tentar cobrar
       cartão/Pix/boleto que a pessoa nem viu ainda. */
    if (isMobileWizard() && mobileStep === 'review') {
      cta.textContent = t('continueToPayment');
      return;
    }
    const tab = activePaymentTab();
    if (tab === 'pix') cta.textContent = t('pixGenerate') || 'Gerar Pix';
    else if (tab === 'boleto') cta.textContent = t('boletoGenerate') || 'Gerar boleto';
    else cta.textContent = cachedPayLabel || cta.textContent || '';
  }

  /**
   * `pointer-events:none` (CSS) só bloqueia mouse/touch — teclado e leitor
   * de tela continuam enxergando e focando os campos "travados" por baixo
   * do overlay, e conseguem editar sem passar pelo Editar. `inert` tira o
   * bloco inteiro da árvore de acessibilidade e da ordem de tab de verdade.
   */
  function lockStepWrap() {
    qs('checkout-step-wrap')?.classList.add('is-locked');
    qs('checkout-contact-section')?.setAttribute('inert', '');
    qs('checkout-address-section')?.setAttribute('inert', '');
  }
  function unlockStepWrap() {
    qs('checkout-step-wrap')?.classList.remove('is-locked');
    qs('checkout-contact-section')?.removeAttribute('inert');
    qs('checkout-address-section')?.removeAttribute('inert');
  }

  function lockAddress(payer: ReturnType<typeof payerFromForm>, addr: ReturnType<typeof addressFromForm>) {
    setText('checkout-locked-name', `${payer.first_name} ${payer.last_name}`.trim());
    setText(
      'checkout-locked-address',
      `${addr.street_name}, ${addr.street_number}${addr.complement ? ` (${addr.complement})` : ''} — ${addr.neighborhood}, ${addr.city}/${addr.federal_unit} · ${addr.zip_code}`
    );
    // Formulário continua visível (só desabilitado por baixo do overlay) —
    // não some, pra não passar a sensação de "sumiu tudo que preenchi".
    // lockStepWrap já foi chamado no clique (submitAddress), antes da
    // cadeia de chamadas — aqui só garante, caso lockAddress seja chamado
    // por outro caminho no futuro.
    show('checkout-address-overlay', true);
    lockStepWrap();
    show('checkout-payment-block', true);
    const lock = qs('checkout-lock-indicator');
    if (lock) lock.hidden = false;
    stage = 'payment';
    syncCta();
    initMercadoPagoSdk();
    // Foco vai pro botão Editar — sem isso quem usa teclado/leitor de tela
    // fica sem indicação de que a etapa mudou.
    qs<HTMLButtonElement>('checkout-edit-address')?.focus();
    // Wizard mobile pousa na revisão (passo 2), não direto no pagamento —
    // pagamento só abre quando a pessoa confirmar o resumo (CTA). No
    // desktop isso não muda nada visível (as 2 colunas já mostram tudo).
    setMobileStep('review');
  }

  qs('checkout-edit-address')?.addEventListener('click', () => {
    show('checkout-address-overlay', false);
    unlockStepWrap();
    show('checkout-payment-block', false);
    const lock = qs('checkout-lock-indicator');
    if (lock) lock.hidden = true;
    stage = 'address';
    syncCta();
    setMobileStep('address');
    qs<HTMLInputElement>('ck-zip')?.focus();
  });

  // Wizard mobile — passo 1 → 2 ("Continuar" dedicado no form e a mesma
  // ação replicada pelo CTA da sidebar quando `mobileStep==='contact'`).
  function advanceFromContact() {
    const valid = validateRequiredFields(['ck-email', 'ck-first-name', 'ck-last-name', 'ck-cpf']);
    if (!valid) {
      setText('checkout-personal-error', t('errorFields'));
      show('checkout-personal-error', true);
      return;
    }
    show('checkout-personal-error', false);
    setMobileStep('address');
    qs<HTMLInputElement>('ck-zip')?.focus();
  }
  qs('checkout-contact-continue')?.addEventListener('click', advanceFromContact);

  // Wizard mobile — "Voltar" do passo 2 (endereço) pro passo 1 (dados).
  qs('checkout-address-back')?.addEventListener('click', () => {
    setMobileStep('contact');
    qs<HTMLInputElement>('ck-email')?.focus();
  });

  // "Esqueci minha senha" — mesmo pedido de reset já usado no Header/conta,
  // salva o rascunho antes (o link do e-mail pode abrir noutra aba).
  qs('ck-forgot-password')?.addEventListener('click', async () => {
    const email = (qs<HTMLInputElement>('ck-email')?.value || '').trim();
    saveCheckoutDraft({ ...payerFromForm(), phone: (qs<HTMLInputElement>('ck-phone')?.value || '').trim(), ...addressFromForm() });
    const statusEl = qs('ck-forgot-status');
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = 'Enviando…';
    }
    try {
      await fetch('/auth/customer/emailpass/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-publishable-api-key': medusaKey() },
        body: JSON.stringify({ identifier: email }),
      });
    } catch {
      /* segue com a mensagem genérica de qualquer forma — evita entregar
         se o e-mail existe ou não na base */
    }
    if (statusEl) statusEl.textContent = 'Se esse e-mail tiver conta, enviamos um link de redefinição.';
  });

  // Máscara nos campos que têm um formato fixo — sem isso ficava só o
  // placeholder como dica, nada formatava enquanto digitava.
  function formatCpfMask(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  function formatPhoneMask(v: string) {
    let d = v.replace(/\D/g, '');
    // Autofill do navegador às vezes inclui o código do país (+55) — sem
    // tirar, sobrava 13 dígitos e a máscara cortava errado, perdendo os
    // últimos 2 e lendo "55" como se fosse DDD.
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  function formatCepMask(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 8);
    return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
  }
  const maskWirings: [string, (v: string) => string][] = [
    ['ck-cpf', formatCpfMask],
    ['ck-phone', formatPhoneMask],
    ['ck-zip', formatCepMask],
  ];
  maskWirings.forEach(([id, formatter]) => {
    const el = qs<HTMLInputElement>(id);
    if (!el) return;
    if (el.value) el.value = formatter(el.value);
    el.addEventListener('input', () => {
      el.value = formatter(el.value);
    });
  });

  // Rascunho (nunca a senha) salvo com debounce a cada campo — sobrevive a
  // uma ida pro fluxo de "esqueci minha senha" e volta preenchido.
  let draftSaveTimer: number | null = null;
  function scheduleDraftSave() {
    if (draftSaveTimer != null) window.clearTimeout(draftSaveTimer);
    draftSaveTimer = window.setTimeout(() => {
      draftSaveTimer = null;
      saveCheckoutDraft({
        ...payerFromForm(),
        phone: (qs<HTMLInputElement>('ck-phone')?.value || '').trim(),
        ...addressFromForm(),
      });
    }, 500);
  }
  [
    'ck-email', 'ck-first-name', 'ck-last-name', 'ck-cpf', 'ck-phone',
    'ck-zip', 'ck-street', 'ck-number', 'ck-complement', 'ck-neighborhood', 'ck-city', 'ck-province',
  ].forEach((id) => qs(id)?.addEventListener('input', scheduleDraftSave));

  // Wizard mobile — "Voltar" dentro do bloco de pagamento (passo 3 → 2).
  // Nada é desmontado, só escondido: campos de cartão/Pix/boleto já
  // preenchidos continuam lá quando a pessoa avançar de novo.
  qs('checkout-payment-back')?.addEventListener('click', () => {
    setMobileStep('review');
    qs<HTMLButtonElement>('checkout-edit-address')?.focus();
  });

  // ---- Passo 1: dados + endereço → cria cart Medusa real, frete, payment session ----
  async function submitAddress() {
    const valid = validateRequiredFields([
      'ck-email', 'ck-first-name', 'ck-last-name', 'ck-cpf',
      'ck-zip', 'ck-street', 'ck-number', 'ck-city', 'ck-province',
    ]);
    if (!valid) {
      setText('checkout-contact-error', t('errorFields'));
      show('checkout-contact-error', true);
      return;
    }
    if (!shipChoice) {
      setText('checkout-contact-error', 'Escolha a forma de entrega. Se nenhuma aparecer, confira o CEP.');
      show('checkout-contact-error', true);
      return;
    }
    show('checkout-contact-error', false);
    const cta = qs<HTMLButtonElement>('checkout-summary-cta');
    if (cta) {
      cta.disabled = true;
      cta.textContent = t('preparing');
    }
    startBusy(['Confirmando seus dados…', 'Calculando o frete…', 'Preparando o pagamento…']);
    // Captura os dados AGORA (clique) e trava a edição por baixo enquanto a
    // cadeia de chamadas roda (pode levar vários segundos — registro, cart,
    // frete, payment session). Sem isso o usuário podia mexer nos campos
    // enquanto esperava, e o resumo/endereço travado saía com valor
    // diferente do que foi realmente enviado (ou até em branco).
    const payer = payerFromForm();
    const addr = addressFromForm();
    lockStepWrap();
    try {
      const accountOk = await ensureAccount();
      if (!accountOk) {
        if (cta) {
          cta.disabled = false;
          cta.textContent = t('continueToPayment');
        }
        unlockStepWrap();
        return;
      }
      show('checkout-login-needed', false);

      const { createMedusaCartFromLocalCart } = await import('../lib/medusa-checkout-cart');
      cartId = await createMedusaCartFromLocalCart();

      await medusaFetch(`/store/carts/${cartId}`, {
        method: 'POST',
        body: JSON.stringify({
          email: payer.email,
          shipping_address: {
            first_name: payer.first_name,
            last_name: payer.last_name,
            address_1: addr.street_name,
            address_2: addr.street_number,
            metadata: { neighborhood: addr.neighborhood, complement: addr.complement },
            city: addr.city,
            province: addr.federal_unit,
            postal_code: addr.zip_code,
            country_code: 'br',
            phone: (qs<HTMLInputElement>('ck-phone')?.value || '').trim(),
          },
        }),
      });
      // Best-effort, não trava o checkout se falhar — disponibiliza esse
      // endereço pra próxima compra (card no passo 2 do próximo checkout).
      void persistAddressToAccount(addr, payer);

      const shipRes = await medusaFetch(`/store/shipping-options?cart_id=${cartId}`);
      const option = (shipRes?.shipping_options ?? []).find((o: any) => o?.data?.id === `melhorenvio-${shipChoice!.id}` || o?.name === shipChoice!.name);
      if (!option) throw new Error('Este serviço de entrega não está disponível para o seu endereço. Escolha outro.');
      await medusaFetch(`/store/carts/${cartId}/shipping-methods`, {
        method: 'POST',
        body: JSON.stringify({ option_id: option.id }),
      });

      const cartRes = await medusaFetch(`/store/carts/${cartId}`);
      const cart = cartRes?.cart ?? {};
      const total = Number(cart.total ?? 0);
      const shipping = Number(cart.shipping_total ?? 0);
      const discount = Number(cart.discount_total ?? 0);
      setText('checkout-summary-total', fmtBrl(total));
      setText('checkout-summary-toggle-total', fmtBrl(total));
      payableTotal = total;
      renderInstallments();
      if (shipping > 0) {
        setText('checkout-summary-shipping', fmtBrl(shipping));
        show('checkout-summary-shipping-row', true);
      }
      if (discount > 0) {
        setText('checkout-summary-discount', `-${fmtBrl(discount)}`);
        show('checkout-summary-discount-row', true);
      }

      const pcRes = await medusaFetch('/store/payment-collections', {
        method: 'POST',
        body: JSON.stringify({ cart_id: cartId }),
      });
      const pcolId = pcRes?.payment_collection?.id;
      const psRes = await medusaFetch(`/store/payment-collections/${pcolId}/payment-sessions`, {
        method: 'POST',
        body: JSON.stringify({ provider_id: 'pp_mercadopago_mercadopago' }),
      });
      const sessions = psRes?.payment_collection?.payment_sessions ?? [];
      paymentSessionId = sessions[sessions.length - 1]?.id;
      if (!paymentSessionId) throw new Error('Sem sessão de pagamento');

      cachedPayLabel = t('payButton').replace('{amount}', fmtBrl(total));
      lockAddress(payer, addr);
      syncCta();
    } catch (err) {
      unlockStepWrap();
      setText('checkout-contact-error', err instanceof Error ? err.message : t('errorGeneric'));
      show('checkout-contact-error', true);
    } finally {
      stopBusy();
      if (cta) cta.disabled = false;
    }
  }
  qs('checkout-contact-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void submitAddress();
  });

  // ---- Abas de método de pagamento ----
  document.querySelectorAll<HTMLButtonElement>('[data-payment-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const method = tab.dataset.paymentTab;
      document.querySelectorAll<HTMLButtonElement>('[data-payment-tab]').forEach((b) => b.classList.toggle('is-active', b === tab));
      document.querySelectorAll<HTMLElement>('[data-payment-panel]').forEach((p) => {
        p.hidden = p.dataset.paymentPanel !== method;
      });
      syncCta();
    });
  });

  // ---- Resumo: dropdown ----
  qs('checkout-summary-toggle')?.addEventListener('click', () => {
    const toggle = qs<HTMLButtonElement>('checkout-summary-toggle');
    const body = qs('checkout-summary-body');
    const open = body?.hidden ?? false;
    if (body) body.hidden = !open;
    toggle?.setAttribute('aria-expanded', String(open));
  });

  // ---- Cartão: Secure Fields ----
  function initMercadoPagoSdk() {
    if (mp) return; // já montado (voltar do "Editar" não precisa remontar)
    const pk = (window.__MERCADOPAGO_PK__ || '').trim();
    if (!pk) return;
    const mount = () => {
      if (!window.MercadoPago) return;
      mp = new window.MercadoPago(pk, { locale: 'pt-BR' });
      const numberField = mp.fields.create('cardNumber', {
        placeholder: '0000 0000 0000 0000',
        style: { color: '#f5f5f5', fontSize: '15px', placeholderColor: 'rgba(245,245,245,.4)' },
      });
      const expirationField = mp.fields.create('expirationDate', {
        placeholder: 'MM/AA',
        style: { color: '#f5f5f5', fontSize: '15px', placeholderColor: 'rgba(245,245,245,.4)' },
      });
      const cvvField = mp.fields.create('securityCode', {
        placeholder: 'CVV',
        style: { color: '#f5f5f5', fontSize: '15px', placeholderColor: 'rgba(245,245,245,.4)' },
      });
      numberField.mount('ck-card-number');
      expirationField.mount('ck-card-expiration');
      cvvField.mount('ck-card-cvv');
      cardFields = { number: numberField, expiration: expirationField, cvv: cvvField };

      numberField.on('binChanged', async (data: { bin?: string }) => {
        if (!data?.bin) return;
        try {
          const methods = await mp.getPaymentMethods({ bin: data.bin });
          detectedPaymentMethodId = methods?.results?.[0]?.id || '';
          if (payableTotal > 0) {
            const options = await mp.getInstallments({ amount: String(payableTotal), bin: data.bin, paymentTypeId: 'credit_card' });
            renderInstallments(options?.[0]?.payer_costs);
          }
        } catch {
          detectedPaymentMethodId = '';
          renderInstallments();
        }
      });
    };
    if (window.MercadoPago) mount();
    else document.getElementById('mp-sdk')?.addEventListener('load', mount);
  }

  async function submitCard() {
    const holderName = (qs<HTMLInputElement>('ck-card-holder')?.value || '').trim();
    if (!mp || !cardFields || !holderName) {
      setText('checkout-card-error', t('errorFields'));
      show('checkout-card-error', true);
      return;
    }
    setText('checkout-card-error', '');
    show('checkout-card-error', false);
    const cta = qs<HTMLButtonElement>('checkout-summary-cta');
    const originalLabel = cta?.textContent ?? '';
    if (cta) {
      cta.disabled = true;
      cta.textContent = t('processing');
    }
    startBusy(['Enviando seu pagamento com segurança…', 'Confirmando a transação…', 'Quase lá, finalizando seu pedido…']);
    try {
      const payer = payerFromForm();
      const tokenResult = await mp.fields.createCardToken({
        cardholderName: holderName,
        identificationType: 'CPF',
        identificationNumber: payer.cpf,
      });
      const installments = Number(qs<HTMLSelectElement>('ck-installments')?.value || 1);
      await medusaFetch('/store/checkout/mercadopago/card', {
        method: 'POST',
        body: JSON.stringify({
          payment_session_id: paymentSessionId,
          token: tokenResult.id,
          // Opcional — o Mercado Pago infere a bandeira do token sozinho.
          // `binChanged` é só um bônus quando dispara a tempo, nunca bloqueia o envio.
          payment_method_id: detectedPaymentMethodId || undefined,
          installments,
          payer: { email: payer.email, cpf: payer.cpf },
        }),
      });
      await completeCart();
    } catch (err) {
      setText('checkout-card-error', err instanceof Error ? err.message : t('errorGeneric'));
      show('checkout-card-error', true);
      if (cta) cta.textContent = originalLabel;
    } finally {
      stopBusy();
      if (cta) cta.disabled = false;
    }
  }
  qs('checkout-card-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void submitCard();
  });

  // ---- Pix ----
  async function generatePix() {
    show('checkout-pix-error', false);
    const cta = qs<HTMLButtonElement>('checkout-summary-cta');
    if (cta) cta.disabled = true;
    startBusy(['Gerando seu Pix…', 'Quase pronto…']);
    try {
      const payer = payerFromForm();
      const data = await medusaFetch('/store/checkout/mercadopago/pix', {
        method: 'POST',
        body: JSON.stringify({ payment_session_id: paymentSessionId, payer }),
      });
      if (data.qr_code_base64) {
        const img = qs<HTMLImageElement>('checkout-pix-qr');
        if (img) img.src = `data:image/png;base64,${data.qr_code_base64}`;
      }
      const codeEl = qs<HTMLTextAreaElement>('checkout-pix-code');
      if (codeEl) codeEl.value = data.qr_code || '';
      show('checkout-pix-form', false);
      show('checkout-pix-result', true);
      paymentDone = true;
      syncCta();
      startPolling(() => void completeCart());
    } catch (err) {
      setText('checkout-pix-error', err instanceof Error ? err.message : t('errorGeneric'));
      show('checkout-pix-error', true);
      if (cta) cta.disabled = false;
    } finally {
      stopBusy();
    }
  }

  qs('checkout-pix-copy')?.addEventListener('click', async () => {
    const codeEl = qs<HTMLTextAreaElement>('checkout-pix-code');
    if (!codeEl?.value) return;
    try {
      await navigator.clipboard.writeText(codeEl.value);
      setText('checkout-pix-copy', t('pixCopied'));
      window.setTimeout(() => setText('checkout-pix-copy', t('pixCopy')), 2000);
    } catch {
      /* clipboard indisponível — usuário copia manualmente do textarea */
    }
  });

  // ---- Boleto ----
  async function generateBoleto() {
    show('checkout-boleto-error', false);
    const cta = qs<HTMLButtonElement>('checkout-summary-cta');
    if (cta) cta.disabled = true;
    startBusy(['Gerando seu boleto…', 'Quase pronto…']);
    try {
      const payer = payerFromForm();
      const addr = addressFromForm();
      const data = await medusaFetch('/store/checkout/mercadopago/boleto', {
        method: 'POST',
        body: JSON.stringify({ payment_session_id: paymentSessionId, payer: { ...payer, address: addr } }),
      });
      const link = qs<HTMLAnchorElement>('checkout-boleto-link');
      if (link) link.href = data.boleto_url || '#';
      setText('checkout-boleto-barcode', data.barcode || '');
      show('checkout-boleto-form', false);
      show('checkout-boleto-result', true);
      paymentDone = true;
      syncCta();
      startPolling(() => void completeCart());
    } catch (err) {
      setText('checkout-boleto-error', err instanceof Error ? err.message : t('errorGeneric'));
      show('checkout-boleto-error', true);
      if (cta) cta.disabled = false;
    } finally {
      stopBusy();
    }
  }

  // ---- Botão único: decide a ação pela etapa/aba atual ----
  qs('checkout-summary-cta')?.addEventListener('click', () => {
    if (paymentDone) return;
    if (isMobileWizard() && mobileStep === 'contact') {
      advanceFromContact();
      return;
    }
    if (stage === 'address') {
      void submitAddress();
      return;
    }
    if (isMobileWizard() && mobileStep === 'review') {
      setMobileStep('payment');
      qs('checkout-payment-back')?.focus();
      return;
    }
    const tab = activePaymentTab();
    if (tab === 'card') void submitCard();
    else if (tab === 'pix') void generatePix();
    else if (tab === 'boleto') void generateBoleto();
  });

  syncCta();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
