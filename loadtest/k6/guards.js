// Recusas do teste de carga. Fica num módulo próprio para um teste de Node (tools/loadtest-guards.test.mjs) conferir a regra.
const PRODUCAO = /^https?:\/\/(?:(?:www|medusa|api|admin)\.)?tyershop\.com(?::\d+)?(?:\/|$)/i;

/** Motivo para não rodar (ou null). Produção nunca roda; qualquer outro destino pede a confirmação explícita. */
export function refusal(front, api, env) {
  if ([front, api].some((url) => PRODUCAO.test(url))) {
    return "Recusado: essa carga cria contas, pedidos e pagamentos e nunca roda contra a produção (tyershop.com).";
  }
  if (env.I_UNDERSTAND_THIS_CREATES_ORDERS !== "yes") {
    return "Recusado: defina I_UNDERSTAND_THIS_CREATES_ORDERS=yes (ambiente descartável: cria clientes, carrinhos e pedidos).";
  }
  return null;
}

/** Fração de quem paga (0 a 1): vazio ou inválido volta ao padrão, em vez de virar 0 e ninguém pagar. */
export function payRate(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 1;
}

/** E-mails que a carga cria (para a limpeza achar só o que é dela). */
export const CARGA_EMAIL = /@carga-teste\.invalid$|^carga[+-].*@teste\.local$/i;
