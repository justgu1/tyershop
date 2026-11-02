import type { MedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { assertCartAllowed, loadCart } from "../../../../modules/drop/access";
import { MercadoPagoClient, type MercadoPagoPayment } from "../../../../modules/payment-mercadopago/client";

/**
 * Helpers compartilhados pelos 3 endpoints de confirmação (card/pix/boleto).
 * Não é uma rota — arquivos sem `route.ts` não viram endpoint no Medusa.
 */

export function getMercadoPagoClient(): MercadoPagoClient {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "MERCADOPAGO_ACCESS_TOKEN não configurado.");
  }
  return new MercadoPagoClient({
    accessToken,
    notificationUrl: process.env.MERCADOPAGO_NOTIFICATION_URL,
  });
}

/**
 * Busca a payment session pelo id e confirma que pertence ao provider
 * mercadopago — o valor a cobrar vem SEMPRE daqui (nunca do body do
 * request), então o cliente não consegue manipular o preço.
 */
export async function getMercadoPagoPaymentSession(req: MedusaRequest, paymentSessionId: string) {
  const paymentModuleService = req.scope.resolve(Modules.PAYMENT);
  const session = await paymentModuleService.retrievePaymentSession(paymentSessionId);

  if (!session || session.provider_id !== "pp_mercadopago_mercadopago") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "payment_session_id inválido para o provider mercadopago.");
  }

  return { paymentModuleService, session };
}

const OPEN_STATUSES = ["approved", "authorized", "pending", "in_process", "in_mediation"];

/** Valor em reais com 2 casas, como o Mercado Pago espera e como a autorização compara. */
export const toAmount = (v: unknown) => Math.round(Number(v) * 100) / 100;

/**
 * Cobrança sempre em nome da conta logada, dona do carrinho, e com o carrinho ainda comprável
 * (acesso ao drop, limite por pessoa já contando pagamentos em andamento) antes de qualquer cobrança sair.
 * Roda sob lock por cliente: duas tentativas simultâneas não passam juntas pela checagem.
 *
 * Se a sessão já tem um pagamento em aberto, devolve esse mesmo pagamento em vez de cobrar de novo.
 * Depois de uma recusa, a nova tentativa usa outra chave de idempotência.
 */
export async function guardedPayment(
  req: MedusaRequest,
  session: { id: string; payment_collection_id?: string | null; data?: unknown },
  create: (idempotencyKey: string) => Promise<MercadoPagoPayment>,
  persist: (payment: MercadoPagoPayment, attempt: number) => Promise<void>
): Promise<{ payment: MercadoPagoPayment; reused: boolean }> {
  const customerId = (req as any).auth_context?.actor_id as string | undefined;
  if (!customerId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Entre na sua conta para pagar.");

  const locking = req.scope.resolve(Modules.LOCKING) as any;
  return locking.execute(
    `pay:${customerId}`,
    async () => {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data } = await query.graph({
        entity: "cart",
        fields: ["id", "customer_id"],
        filters: { payment_collection: { id: session.payment_collection_id ?? "" } } as any,
      });
      const cart = (data as any[])[0];
      if (!cart || cart.customer_id !== customerId) {
        throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Esta sessão de pagamento não pertence à sua conta.");
      }

      const prev = (session.data ?? {}) as { mp_payment_id?: number; attempt?: number };
      if (prev.mp_payment_id) {
        const existing = await getMercadoPagoClient().getPayment(prev.mp_payment_id);
        if (OPEN_STATUSES.includes(existing.status)) return { payment: existing, reused: true };
      }

      const { lines } = await loadCart(req.scope, cart.id);
      await assertCartAllowed(req.scope, { customerId, lines, mode: "pay", excludeCartId: cart.id });

      const attempt = (prev.attempt ?? 0) + 1;
      const payment = await create(`${session.id}-${attempt}`);
      await persist(payment, attempt);
      return { payment, reused: false };
    },
    { timeout: 30 }
  );
}

/** Só para consultar status: a sessão precisa ser do carrinho da conta logada. */
export async function assertSessionOwner(req: MedusaRequest, session: { payment_collection_id?: string | null }) {
  const customerId = (req as any).auth_context?.actor_id as string | undefined;
  if (!customerId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Entre na sua conta.");
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "customer_id"],
    filters: { payment_collection: { id: session.payment_collection_id ?? "" } } as any,
  });
  if ((data as any[])[0]?.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Esta sessão de pagamento não pertence à sua conta.");
  }
}
