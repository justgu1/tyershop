const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { randomUUID } = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);

const corsOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  corsOrigins.length > 0
    ? cors({
        origin(origin, cb) {
          if (!origin || corsOrigins.includes(origin)) return cb(null, true);
          return cb(new Error('Not allowed by CORS'));
        },
        credentials: true,
      })
    : cors()
);
app.use(express.json());

/** URL do Medusa acessível a partir deste serviço (ex.: `http://backend:9000` no Docker). */
function medusaBaseUrl() {
  return String(process.env.MEDUSA_INTERNAL_URL || process.env.MEDUSA_URL || 'http://localhost:9003').replace(/\/$/, '');
}

function medusaPublishableHeaders() {
  const pk = String(process.env.MEDUSA_PUBLISHABLE_KEY || process.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY || '').trim();
  if (!pk) throw new Error('MEDUSA_PUBLISHABLE_KEY ou PUBLIC_MEDUSA_PUBLISHABLE_KEY em falta');
  return { 'x-publishable-api-key': pk };
}

async function fetchStoreCart(cartId) {
  const base = medusaBaseUrl();
  const { data } = await axios.get(`${base}/store/carts/${encodeURIComponent(cartId)}`, {
    headers: medusaPublishableHeaders(),
  });
  return data?.cart;
}

/** Total do carrinho em unidades principais da moeda (ex.: BRL em reais). */
function cartTotalMajorUnits(cart) {
  if (!cart) return null;
  const raw = cart.total ?? cart.subtotal;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n) / 100;
}

function lineItemTitle(li) {
  return String(li.title || li.product_title || li.variant?.title || 'Produto').trim() || 'Produto';
}

/** URL pública da loja (redirect do Checkout Pro). Com `auto_return`, o MP exige `back_urls.success`. */
function checkoutPublicBaseUrl() {
  return String(
    process.env.CHECKOUT_PUBLIC_BASE_URL ||
      process.env.PUBLIC_SITE_URL ||
      process.env.STOREFRONT_URL ||
      'http://localhost:4321'
  ).replace(/\/$/, '');
}

/** Junta defaults com `back_urls` opcional vindo do cliente. */
function mergeMercadoPagoBackUrls(reqBody) {
  const base = checkoutPublicBaseUrl();
  const defaults = {
    success: `${base}/cart?mp=success`,
    failure: `${base}/cart?mp=failure`,
    pending: `${base}/cart?mp=pending`,
  };
  const client = reqBody?.back_urls;
  const merged =
    client && typeof client === 'object' && !Array.isArray(client) ? { ...defaults, ...client } : { ...defaults };
  const out = {};
  for (const k of ['success', 'failure', 'pending']) {
    const v = merged[k];
    if (v != null && String(v).trim()) out[k] = String(v).trim();
  }
  if (!out.success) out.success = defaults.success;
  if (!out.failure) out.failure = defaults.failure;
  if (!out.pending) out.pending = defaults.pending;
  return out;
}

/** Com `auto_return: approved`, o MP exige `back_urls` em HTTPS; `http://localhost` falha com erro pouco claro. */
function backUrlsAllowAutoReturn(backUrls) {
  return ['success', 'failure', 'pending'].every((k) => {
    const u = String(backUrls?.[k] || '').trim();
    return u.startsWith('https://');
  });
}

function cartToMercadoPagoItems(cart) {
  const items = Array.isArray(cart?.items) ? cart.items : [];
  return items
    .map((li) => {
      const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
      const cents = Number(li.unit_price);
      if (!Number.isFinite(cents) || cents < 0) return null;
      const unit = Math.max(0.01, Math.round(cents) / 100);
      const vid = String(li.variant_id || li.variant?.id || li.id || '').trim();
      const row = {
        title: lineItemTitle(li),
        quantity: qty,
        unit_price: unit,
      };
      if (vid) row.id = vid;
      return row;
    })
    .filter(Boolean);
}
const smtpPort = Number(process.env.SMTP_PORT || 1025);
const smtpTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mailpit',
  port: Number.isFinite(smtpPort) ? smtpPort : 1025,
  secure: false,
});

function escapeMailText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeSubjectPart(s) {
  return String(s ?? '')
    .replace(/[\r\n\u0000]/g, ' ')
    .trim()
    .slice(0, 100);
}

app.post('/api/stock-notify', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const variantId = String(req.body?.variant_id || '').trim();
    const variantTitle = String(req.body?.variant_title || '').trim();
    const productId = String(req.body?.product_id || '').trim();
    const productHandle = String(req.body?.product_handle || '').trim();
    const productTitle = String(req.body?.product_title || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (!variantId) {
      return res.status(400).json({ error: 'variant_id obrigatório' });
    }
    const titleLine = productTitle || productHandle || productId || '—';
    const varLine = variantTitle || variantId;
    const textBody = [
      'Pedido de aviso quando houver stock.',
      '',
      `E-mail do cliente: ${email}`,
      `Produto: ${titleLine}`,
      productHandle ? `Handle: ${productHandle}` : null,
      productId ? `Id produto: ${productId}` : null,
      `Variação: ${varLine}`,
      `Id variante: ${variantId}`,
    ]
      .filter(Boolean)
      .join('\n');
    const ht = escapeMailText;
    await smtpTransport.sendMail({
      from: process.env.STOCK_NOTIFY_FROM || process.env.NEWSLETTER_FROM || 'shop@tyer.local',
      to: process.env.STOCK_NOTIFY_TO || process.env.NEWSLETTER_TO || 'loja@tyer.local',
      subject: `Aviso de stock — ${safeSubjectPart(titleLine)} (${safeSubjectPart(varLine)})`,
      text: textBody,
      html: `<p><strong>Aviso de stock</strong></p><ul>
<li><strong>E-mail do cliente:</strong> ${ht(email)}</li>
<li><strong>Produto:</strong> ${ht(productTitle || '—')}</li>
<li><strong>Handle:</strong> ${ht(productHandle || '—')}</li>
<li><strong>Id produto:</strong> ${ht(productId || '—')}</li>
<li><strong>Variação:</strong> ${ht(variantTitle || '—')}</li>
<li><strong>Id variante:</strong> ${ht(variantId)}</li>
</ul>`,
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Stock notify email error:', error);
    return res.status(500).json({ error: 'Failed to register stock notify' });
  }
});

app.post('/api/newsletter', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    await smtpTransport.sendMail({
      from: process.env.NEWSLETTER_FROM || 'news@tyer.local',
      to: process.env.NEWSLETTER_TO || email,
      subject: 'Novo cadastro na newsletter Tyer',
      text: `Novo inscrito: ${email}`,
      html: `<p>Novo inscrito na newsletter:</p><p><strong>${email}</strong></p>`,
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error('Newsletter email error:', error);
    return res.status(500).json({ error: 'Failed to send newsletter email' });
  }
});

app.post('/api/create-checkout', async (req, res) => {
  try {
    const token = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
    if (!token) {
      return res.status(503).json({ error: 'MERCADOPAGO_ACCESS_TOKEN não configurado' });
    }

    const cartId = String(req.body?.cart_id || '').trim();
    if (!cartId) {
      return res.status(400).json({
        error:
          'Envie apenas `cart_id` do carrinho Medusa. Preços e quantidades são lidos no servidor — não use `items` do browser.',
      });
    }

    const cart = await fetchStoreCart(cartId);
    if (!cart?.items?.length) {
      return res.status(400).json({ error: 'Carrinho Medusa vazio ou inexistente' });
    }

    const mpItems = cartToMercadoPagoItems(cart);
    if (!mpItems.length) {
      return res.status(400).json({ error: 'Não foi possível mapear itens do carrinho' });
    }

    const currency = String(cart.region?.currency_code || cart.currency_code || 'brl').toUpperCase();
    const bu = mergeMercadoPagoBackUrls(req.body);
    const notification_url =
      typeof req.body?.notification_url === 'string' && req.body.notification_url.trim()
        ? req.body.notification_url.trim()
        : undefined;

    /** Checkout Pro: POST directo à REST API. */
    const back_urls = {
      success: bu.success,
      failure: bu.failure,
      pending: bu.pending,
    };
    const preferenceBody = {
      items: mpItems,
      currency_id: currency.length === 3 ? currency : 'BRL',
      back_urls,
      metadata: { medusa_cart_id: cartId },
      external_reference: cartId,
    };
    if (backUrlsAllowAutoReturn(back_urls)) {
      preferenceBody.auto_return = 'approved';
    }
    if (notification_url) preferenceBody.notification_url = notification_url;

    const { data } = await axios.post('https://api.mercadopago.com/checkout/preferences', preferenceBody, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': randomUUID(),
      },
    });

    return res.json({ id: data.id, init_point: data.init_point });
  } catch (error) {
    const st = error.response?.status;
    const payload = error.response?.data;
    console.error('create-checkout:', st, payload || error.message);
    if (st === 400 && payload) {
      return res.status(400).json({ error: 'Mercado Pago rejeitou a preferência', details: payload });
    }
    return res.status(500).json({ error: 'Failed to create preference', details: payload || error.message });
  }
});

/**
 * Checkout transparente (Payment Brick): o corpo segue o payload do Brick / Payments API.
 * @see https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/default-rendering
 */
app.post('/api/process-payment', async (req, res) => {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'MERCADOPAGO_ACCESS_TOKEN não configurado' });
  }
  try {
    const raw = req.body;
    if (!raw || typeof raw !== 'object') {
      return res.status(400).json({ error: 'Body inválido' });
    }
    const cartId = String(raw.cart_id || '').trim();
    const body = { ...raw };
    delete body.cart_id;

    if (!cartId) {
      return res.status(400).json({ error: 'cart_id obrigatório (carrinho Medusa validado no servidor)' });
    }
    const cart = await fetchStoreCart(cartId);
    const serverTotal = cartTotalMajorUnits(cart);
    if (!(Number.isFinite(serverTotal) && serverTotal > 0)) {
      return res.status(400).json({ error: 'Total do carrinho inválido no Medusa' });
    }
    body.transaction_amount = serverTotal;
    body.external_reference = body.external_reference || cartId;
    const meta =
      typeof body.metadata === 'object' && body.metadata !== null && !Array.isArray(body.metadata)
        ? body.metadata
        : {};
    body.metadata = { ...meta, medusa_cart_id: cartId };

    const idempotencyKey =
      String(req.headers['x-idempotency-key'] || '').trim() ||
      `tyer-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const { data } = await axios.post('https://api.mercadopago.com/v1/payments', body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
    });
    return res.json(data);
  } catch (error) {
    const status = error.response?.status || 500;
    const payload = error.response?.data;
    console.error('Mercado Pago /v1/payments:', payload || error.message);
    return res.status(status).json({
      error: typeof payload === 'object' && payload?.message ? payload.message : 'Falha ao processar pagamento',
      details: payload,
    });
  }
});

app.post('/api/webhook', async (req, res) => {
  const { type, data } = req.body;
  
  if (type === 'payment') {
    // 1. Validate payment with Mercado Pago
    // 2. Map to Medusa Order
    // 3. Mark as paid in Medusa
    console.log('Payment notification received:', data.id);
    
    try {
      // Example: medusa.admin.orders.capturePayment(order_id)
    } catch (e) {
      console.error('Error updating Medusa order:', e);
    }
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
});
