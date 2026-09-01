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
