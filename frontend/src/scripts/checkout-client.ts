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

declare global {
  interface Window {
    __MEDUSA_PK__?: string;
    __MERCADOPAGO_PK__?: string;
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

function renderSummary(items: CartItem[]) {
  const list = qs('checkout-summary-items');
  if (list) {
    list.innerHTML = items
      .map((item) => {
        const img = item.thumbnail
          ? `<img class="checkout-summary__item-img" src="${item.thumbnail}" alt="" loading="lazy" />`
          : '';
        const variantLine = [item.variantTitle ? `Tamanho: ${item.variantTitle}` : '', `x${item.quantity}`]
          .filter(Boolean)
          .join(' · ');
        return `
          <div class="checkout-summary__item">
            <div class="checkout-summary__item-img-wrap">${img}</div>
            <div class="checkout-summary__item-info">
              <span class="checkout-summary__item-title">${item.title}</span>
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

  const items = getCart();
  if (!items.length) {
    // Bag vazia não tem o que fazer no checkout — manda pra loja com um
    // aviso, em vez de deixar a pessoa presa numa página em branco.
    window.location.href = '/shop?empty_checkout=1';
    return;
  }
  renderSummary(items);

  // Pré-preenche o CEP se o cliente já digitou na PDP (evita perguntar de
  // novo — "Comprar agora" pula direto pra cá).
  try {
    const lastCep = localStorage.getItem('tyer_last_cep');
    const zipInput = qs<HTMLInputElement>('ck-zip');
    if (lastCep && zipInput && !zipInput.value) zipInput.value = lastCep;
  } catch {
    /* storage indisponível: segue sem pré-preencher */
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

  function stopPolling() {
    if (pollTimer != null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function completeCart() {
    const data = await medusaFetch(`/store/carts/${cartId}/complete`, { method: 'POST' });
    if (data?.type === 'order') {
      stopPolling();
      clearCart();
      show('checkout-form-section', false);
      const panel = qs('checkout-summary-panel');
      if (panel) panel.hidden = true;
      const lock = qs('checkout-lock-indicator');
      if (lock) lock.hidden = true;
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
      city: (qs<HTMLInputElement>('ck-city')?.value || '').trim(),
      federal_unit: (qs<HTMLInputElement>('ck-province')?.value || '').trim(),
    };
  }

  function contactFormValid() {
    const payer = payerFromForm();
    const addr = addressFromForm();
    return Boolean(
      payer.email && payer.first_name && payer.last_name && payer.cpf.length === 11 &&
      addr.zip_code && addr.street_name && addr.street_number && addr.city && addr.federal_unit
    );
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

  /** O botão único embaixo do resumo muda de rótulo conforme a etapa/aba atual. */
  function syncCta(totalLabel?: string) {
    const cta = qs<HTMLButtonElement>('checkout-summary-cta');
    if (!cta) return;
    if (paymentDone) {
      cta.disabled = true;
      cta.textContent = t('processing') === 'processing' ? 'Aguardando pagamento…' : t('processing');
      return;
    }
    cta.disabled = false;
    if (stage === 'address') {
      cta.textContent = t('continueToPayment');
      return;
    }
    const tab = activePaymentTab();
    if (tab === 'pix') cta.textContent = t('pixGenerate') || 'Gerar Pix';
    else if (tab === 'boleto') cta.textContent = t('boletoGenerate') || 'Gerar boleto';
    else cta.textContent = totalLabel ?? cta.textContent ?? '';
  }

  function lockAddress(payer: ReturnType<typeof payerFromForm>, addr: ReturnType<typeof addressFromForm>) {
    setText('checkout-locked-name', `${payer.first_name} ${payer.last_name}`.trim());
    setText(
      'checkout-locked-address',
      `${addr.street_name}, ${addr.street_number} — ${addr.neighborhood}, ${addr.city}/${addr.federal_unit} · ${addr.zip_code}`
    );
    // Formulário continua visível (só desabilitado por baixo do overlay) —
    // não some, pra não passar a sensação de "sumiu tudo que preenchi".
    // A classe is-locked já foi aplicada no clique (submitAddress), antes
    // da cadeia de chamadas — aqui só garante, caso lockAddress seja
    // chamado por outro caminho no futuro.
    show('checkout-address-overlay', true);
    qs('checkout-step-wrap')?.classList.add('is-locked');
    show('checkout-payment-block', true);
    const lock = qs('checkout-lock-indicator');
    if (lock) lock.hidden = false;
    stage = 'payment';
    syncCta();
    initMercadoPagoSdk();
  }

  qs('checkout-edit-address')?.addEventListener('click', () => {
    show('checkout-address-overlay', false);
    qs('checkout-step-wrap')?.classList.remove('is-locked');
    show('checkout-payment-block', false);
    const lock = qs('checkout-lock-indicator');
    if (lock) lock.hidden = true;
    stage = 'address';
    syncCta();
  });

  // ---- Passo 1: dados + endereço → cria cart Medusa real, frete, payment session ----
  async function submitAddress() {
    if (!contactFormValid()) {
      setText('checkout-contact-error', t('errorFields'));
      show('checkout-contact-error', true);
      return;
    }
    show('checkout-contact-error', false);
    const cta = qs<HTMLButtonElement>('checkout-summary-cta');
    if (cta) {
      cta.disabled = true;
      cta.textContent = t('preparing');
    }
    // Captura os dados AGORA (clique) e trava a edição por baixo enquanto a
    // cadeia de chamadas roda (pode levar vários segundos — registro, cart,
    // frete, payment session). Sem isso o usuário podia mexer nos campos
    // enquanto esperava, e o resumo/endereço travado saía com valor
    // diferente do que foi realmente enviado (ou até em branco).
    const payer = payerFromForm();
    const addr = addressFromForm();
    qs('checkout-step-wrap')?.classList.add('is-locked');
    try {
      const accountOk = await ensureAccount();
      if (!accountOk) {
        if (cta) {
          cta.disabled = false;
          cta.textContent = t('continueToPayment');
        }
        qs('checkout-step-wrap')?.classList.remove('is-locked');
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
            address_1: `${addr.street_name}, ${addr.street_number}`,
            city: addr.city,
            province: addr.federal_unit,
            postal_code: addr.zip_code,
            country_code: 'br',
            phone: (qs<HTMLInputElement>('ck-phone')?.value || '').trim(),
          },
        }),
      });

      const shipRes = await medusaFetch(`/store/shipping-options?cart_id=${cartId}`);
      const option = shipRes?.shipping_options?.[0];
      if (option) {
        await medusaFetch(`/store/carts/${cartId}/shipping-methods`, {
          method: 'POST',
          body: JSON.stringify({ option_id: option.id }),
        });
      }

      const cartRes = await medusaFetch(`/store/carts/${cartId}`);
      const cart = cartRes?.cart ?? {};
      const total = Number(cart.total ?? 0);
      const shipping = Number(cart.shipping_total ?? 0);
      setText('checkout-summary-total', fmtBrl(total));
      setText('checkout-summary-toggle-total', fmtBrl(total));
      if (shipping > 0) {
        setText('checkout-summary-shipping', fmtBrl(shipping));
        show('checkout-summary-shipping-row', true);
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

      lockAddress(payer, addr);
      syncCta(t('payButton').replace('{amount}', fmtBrl(total)));
    } catch (err) {
      qs('checkout-step-wrap')?.classList.remove('is-locked');
      setText('checkout-contact-error', err instanceof Error ? err.message : t('errorGeneric'));
      show('checkout-contact-error', true);
    } finally {
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
        } catch {
          detectedPaymentMethodId = '';
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
    }
  }

  // ---- Botão único: decide a ação pela etapa/aba atual ----
  qs('checkout-summary-cta')?.addEventListener('click', () => {
    if (paymentDone) return;
    if (stage === 'address') {
      void submitAddress();
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
