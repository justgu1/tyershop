import type { MedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { assertShippingCurrent } from "../../../../modules/melhor-envio/quote";
import { assertCartAllowed, loadCart, lotLockKey } from "../../../../modules/drop/access";
import { buildAdditionalInfo, type AntifraudCart } from "../../../../modules/payment-mercadopago/additional-info";
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

/** Carrinho dono da coleção de pagamento da sessão (pela ligação entre carrinho e pagamento). */
async function cartOfSession(req: MedusaRequest, session: { payment_collection_id?: string | null }) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: links } = await query.graph({
    entity: "cart_payment_collection",
    fields: ["cart_id"],
    filters: { payment_collection_id: session.payment_collection_id ?? "" },
  });
  const cartId = (links as any[])[0]?.cart_id as string | undefined;
  if (!cartId) return null;
  const { data } = await query.graph({ entity: "cart", fields: ["id", "customer_id"], filters: { id: cartId } });
  return ((data as any[])[0] as { id: string; customer_id: string | null } | undefined) ?? null;
}

/** Itens e endereço do carrinho da sessão, para o antifraude do Mercado Pago. */
export async function loadAntifraudCart(req: MedusaRequest, session: { payment_collection_id?: string | null }) {
  const cart = await cartOfSession(req, session);
  if (!cart) return null;
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "items.product_id", "items.title", "items.variant_title", "items.quantity", "items.unit_price",
      "shipping_address.first_name", "shipping_address.last_name", "shipping_address.phone",
      "shipping_address.postal_code", "shipping_address.address_1", "shipping_address.city", "shipping_address.province",
    ],
    filters: { id: cart.id },
  });
  return ((data as any[])[0] as AntifraudCart | undefined) ?? null;
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
  amount: number,
  create: (idempotencyKey: string) => Promise<MercadoPagoPayment>,
  persist: (payment: MercadoPagoPayment, attempt: number) => Promise<void>
): Promise<{ payment: MercadoPagoPayment; reused: boolean }> {
  const customerId = (req as any).auth_context?.actor_id as string | undefined;
  if (!customerId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Entre na sua conta para pagar.");

  const locking = req.scope.resolve(Modules.LOCKING) as any;
  const cartForLock = await cartOfSession(req, session);
  const lotKey = cartForLock ? await lotLockKey(req.scope, (await loadCart(req.scope, cartForLock.id)).lines) : null;
  return locking.execute(
    lotKey ? [`pay:${customerId}`, lotKey] : `pay:${customerId}`,
    async () => {
      const cart = await cartOfSession(req, session);
      if (!cart || cart.customer_id !== customerId) {
        throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Esta sessão de pagamento não pertence à sua conta.");
      }

      const prev = (session.data ?? {}) as { mp_payment_id?: number; attempt?: number };
      if (prev.mp_payment_id) {
        const client = getMercadoPagoClient();
        const existing = await client.getPayment(prev.mp_payment_id);
        // Pix vencido ainda pode constar como aberto por alguns instantes: não é reaproveitado, vira um código novo.
        const expired = !!existing.date_of_expiration && Date.parse(existing.date_of_expiration) <= Date.now();
        if (OPEN_STATUSES.includes(existing.status) && expired) {
          await client.cancelPayment(prev.mp_payment_id).catch(() => null);
        } else if (OPEN_STATUSES.includes(existing.status)) {
          // O carrinho mudou depois de gerado o pagamento: o antigo não serve mais e é cancelado para dar lugar a um novo.
          if (Math.abs(Number(existing.transaction_amount) - amount) <= 0.009) return { payment: existing, reused: true };
          const cancelled = await client.cancelPayment(prev.mp_payment_id).catch(() => null);
          if (!cancelled || cancelled.status !== "cancelled") {
            throw new MedusaError(
              MedusaError.Types.NOT_ALLOWED,
              "Já existe um pagamento em andamento com outro valor para este pedido. Conclua ou aguarde ele expirar antes de alterar o carrinho."
            );
          }
        }
      }

      const { lines } = await loadCart(req.scope, cart.id);
      await assertCartAllowed(req.scope, { customerId, lines, mode: "pay", excludeCartId: cart.id });
      await assertShippingCurrent(req.scope, cart.id);

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
  const cart = await cartOfSession(req, session);
  if (cart?.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Esta sessão de pagamento não pertence à sua conta.");
  }
}
