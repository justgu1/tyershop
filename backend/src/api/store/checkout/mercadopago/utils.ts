import type { MedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { assertCartAllowed, loadCart } from "../../../../modules/drop/access";
import { MercadoPagoClient } from "../../../../modules/payment-mercadopago/client";

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

/**
 * A sessão de pagamento precisa ser do carrinho da conta logada, e o carrinho ainda precisa poder ser comprado
 * (acesso ao drop e limite por pessoa) antes de qualquer cobrança sair. `strict: false` é só para consultar status.
 */
export async function assertSessionPayable(req: MedusaRequest, session: { id: string; payment_collection_id?: string | null }, strict = true) {
  const customerId = (req as any).auth_context?.actor_id as string | undefined;
  if (!customerId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Entre na sua conta para pagar.");

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
  if (strict) {
    const { lines } = await loadCart(req.scope, cart.id);
    await assertCartAllowed(req.scope, { customerId, lines, mode: "pay" });
  }
}
