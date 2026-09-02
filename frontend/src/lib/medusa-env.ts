/**
 * URL base do Store API Medusa.
 *
 * Lê `process.env` em RUNTIME (adapter Node): `import.meta.env` é resolvido
 * em build time pelo Vite — se o CI não definir a variável, o valor colapsa
 * para o fallback e o SSR passa a fetchear localhost dentro do pod.
 */
export function getMedusaStoreUrl(): string {
  return (
    process.env.MEDUSA_INTERNAL_URL ||
    process.env.MEDUSA_URL ||
    process.env.PUBLIC_MEDUSA_URL ||
    'http://localhost:9003'
  );
}

/**
 * Publishable key da Store API Medusa. Mesma lógica de runtime da URL acima:
 * lida em `process.env` a cada request (SSR), nunca fixa em build time.
 */
export function getPublishableKey(): string {
  return process.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY || '';
}

/**
 * Public key do Mercado Pago (Secure Fields tokeniza cartão no browser com
 * ela) — mesma lógica de runtime: `PUBLIC_*` do frontend é build-time no
 * `astro build` do CI, então o valor setado só no Deployment k8s não teria
 * efeito nenhum se essa função não existisse.
 */
export function getMercadoPagoPublicKey(): string {
  return process.env.PUBLIC_MERCADOPAGO_PUBLIC_KEY || '';
}
