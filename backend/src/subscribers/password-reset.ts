import type { SubscriberArgs, SubscriberConfig } from '@medusajs/framework';

/**
 * Medusa já dispara `auth.password_reset` quando alguém pede reset
 * (POST /auth/customer/emailpass/reset-password), mas não manda e-mail
 * nenhum sozinho — precisa de um subscriber pra isso. Em vez de configurar
 * um módulo de notification novo aqui, delega pro gateway leve que já
 * existe (`api/index.js`, mesmo nodemailer/SMTP já usado em
 * newsletter/aviso de stock), só que este e-mail vai pro CLIENTE, não pra
 * loja.
 */
type PasswordResetEvent = {
  entity_id: string; // e-mail, no provider emailpass
  actor_type: string;
  token: string;
};

export default async function passwordResetHandler({ event: { data } }: SubscriberArgs<PasswordResetEvent>) {
  if (data.actor_type !== 'customer') return; // só cobre reset de cliente da loja

  const siteUrl = (process.env.SITE_URL || 'http://localhost:4321').replace(/\/$/, '');
  const resetUrl = `${siteUrl}/account/reset-password?token=${encodeURIComponent(data.token)}`;
  const apiUrl = (process.env.INTERNAL_API_URL || 'http://api:3000').replace(/\/$/, '');

  try {
    const res = await fetch(`${apiUrl}/api/password-reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: data.entity_id, resetUrl }),
    });
    if (!res.ok) {
      console.error('Password reset email gateway respondeu com erro:', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    // Um e-mail de reset falhando não pode derrubar o subscriber — a
    // resposta HTTP 201 do pedido de reset já foi devolvida antes disso.
    console.error('Falha ao chamar gateway de e-mail para password reset:', err);
  }
}

export const config: SubscriberConfig = {
  event: 'auth.password_reset',
};
