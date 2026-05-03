const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mercadopago = require('mercadopago');
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

const client = new mercadopago.MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });
const preference = new mercadopago.Preference(client);
const smtpPort = Number(process.env.SMTP_PORT || 1025);
const smtpTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mailpit',
  port: Number.isFinite(smtpPort) ? smtpPort : 1025,
  secure: false,
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
    const { items, back_urls, notification_url } = req.body;
    
    // Create preference
    const result = await preference.create({
      body: {
        items,
        back_urls,
        notification_url,
        auto_return: 'approved',
      }
    });

    res.json({ id: result.id, init_point: result.init_point });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create preference' });
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
