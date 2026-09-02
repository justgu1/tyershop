import type { MedusaRequest } from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
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
