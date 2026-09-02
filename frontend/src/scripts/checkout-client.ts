/**
 * Checkout transparente Mercado Pago — porta única (esta função) fala com:
 *  1. Medusa (cria carrinho real a partir do `tyer_cart` local, endereço, frete,
 *     payment collection/session) — igual ao resto do site.
 *  2. Mercado Pago SDK v2 (Secure Fields) SÓ pra tokenizar o cartão no browser
 *     — número/CVV nunca tocam nosso backend.
 *  3. Nossas 3 rotas store/checkout/mercadopago/{card,pix,boleto} — que fazem
 *     a cobrança de verdade — e a rota de status (polling p/ Pix/boleto).
 *
 * Toda troca de gateway futura muda isso aqui + o provider do Medusa, nunca
 * as páginas em volta.
 */
import { getCart, getAppliedPromoCode, clearCart, type CartItem } from '../lib/cart';

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

async function medusaFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-publishable-api-key': medusaKey(),
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
        const img = item.thumbnail ? `<img src="${item.thumbnail}" alt="" loading="lazy" />` : '<span></span>';
        const meta = [item.variantTitle, `x${item.quantity}`].filter(Boolean).join(' · ');
        return `
          <div class="checkout-summary__item">
            ${img}
            <div class="checkout-summary__item-info">
              <span class="checkout-summary__item-title">${item.title}</span>
              <span class="checkout-summary__item-meta">${meta}</span>
            </div>
            <span class="checkout-summary__item-price">${fmtBrl((item.price * item.quantity) / 100)}</span>
          </div>`;
      })
      .join('');
  }
  const subtotalCents = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  setText('checkout-summary-subtotal', fmtBrl(subtotalCents / 100));
  setText('checkout-summary-total', fmtBrl(subtotalCents / 100));
}

function setStep(step: 'address' | 'payment') {
  const stepper = qs('checkout-stepper');
  if (stepper) stepper.dataset.step = step;
  document.querySelectorAll<HTMLElement>('[data-step-label]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.stepLabel === step);
  });
}

function init() {
  const root = qs('checkout-root');
  if (!root) return;
  const t = (key: string) => root.dataset[key] || key;

  const items = getCart();
  if (!items.length) {
    show('checkout-empty', true);
    show('checkout-form-section', false);
    const panel = qs('checkout-summary-panel');
    if (panel) panel.hidden = true;
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

  // ---- Passo 1: dados + endereço → cria cart Medusa real, frete, payment session ----
  qs('checkout-contact-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!contactFormValid()) {
      setText('checkout-contact-error', t('errorFields'));
      show('checkout-contact-error', true);
      return;
    }
    show('checkout-contact-error', false);
    const btn = qs<HTMLButtonElement>('checkout-continue-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('preparing');
    }
    try {
      const { createMedusaCartFromLocalCart } = await import('../lib/medusa-checkout-cart');
      cartId = await createMedusaCartFromLocalCart();

      const payer = payerFromForm();
      const addr = addressFromForm();
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

      document.querySelectorAll<HTMLElement>('[data-pay-amount]').forEach((el) => {
        el.textContent = t('payButton').replace('{amount}', fmtBrl(total));
      });

      show('checkout-contact-section', false);
      show('checkout-payment-section', true);
      setStep('payment');
      initMercadoPagoSdk();
    } catch (err) {
      setText('checkout-contact-error', err instanceof Error ? err.message : t('errorGeneric'));
      show('checkout-contact-error', true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = t('continueToPayment');
      }
    }
  });

  qs('checkout-back-to-address')?.addEventListener('click', () => {
    show('checkout-payment-section', false);
    show('checkout-contact-section', true);
    setStep('address');
  });

  // ---- Abas de método de pagamento ----
  document.querySelectorAll<HTMLButtonElement>('[data-payment-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const method = tab.dataset.paymentTab;
      document.querySelectorAll<HTMLButtonElement>('[data-payment-tab]').forEach((b) => b.classList.toggle('is-active', b === tab));
      document.querySelectorAll<HTMLElement>('[data-payment-panel]').forEach((p) => {
        p.hidden = p.dataset.paymentPanel !== method;
      });
    });
  });

  // ---- Cartão: Secure Fields ----
  function initMercadoPagoSdk() {
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

  qs('checkout-card-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = qs<HTMLButtonElement>('checkout-card-submit');
    const holderName = (qs<HTMLInputElement>('ck-card-holder')?.value || '').trim();
    if (!mp || !cardFields || !holderName) {
      setText('checkout-card-error', t('errorFields'));
      show('checkout-card-error', true);
      return;
    }
    setText('checkout-card-error', '');
    show('checkout-card-error', false);
    const originalLabel = btn?.textContent ?? '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('processing');
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
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    }
  });

  // ---- Pix ----
  qs('checkout-pix-generate')?.addEventListener('click', async () => {
    const btn = qs<HTMLButtonElement>('checkout-pix-generate');
    show('checkout-pix-error', false);
    if (btn) btn.disabled = true;
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
      startPolling(() => void completeCart());
    } catch (err) {
      setText('checkout-pix-error', err instanceof Error ? err.message : t('errorGeneric'));
      show('checkout-pix-error', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

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
  qs('checkout-boleto-generate')?.addEventListener('click', async () => {
    const btn = qs<HTMLButtonElement>('checkout-boleto-generate');
    show('checkout-boleto-error', false);
    if (btn) btn.disabled = true;
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
      startPolling(() => void completeCart());
    } catch (err) {
      setText('checkout-boleto-error', err instanceof Error ? err.message : t('errorGeneric'));
      show('checkout-boleto-error', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
