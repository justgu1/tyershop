import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getMercadoPagoClient, getMercadoPagoPaymentSession } from "../utils";

type Body = {
  payment_session_id: string;
  /** Token gerado no browser via Secure Fields do Mercado Pago — nunca o número do cartão. */
  token: string;
  payment_method_id: string;
  installments: number;
  payer: {
    email: string;
    cpf?: string;
  };
};

/**
 * Confirma um pagamento com cartão. O token já veio pronto do Secure Fields
 * no browser (frontend nunca vê nem manda o número do cartão pra cá).
 */
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { payment_session_id, token, payment_method_id, installments, payer } = req.body ?? ({} as Body);
  if (!payment_session_id || !token || !payment_method_id || !payer?.email) {
    return res
      .status(400)
      .json({ message: "payment_session_id, token, payment_method_id e payer.email são obrigatórios." });
  }

  const client = getMercadoPagoClient();
  const { paymentModuleService, session } = await getMercadoPagoPaymentSession(req, payment_session_id);

  const payment = await client.createCardPayment({
    idempotencyKey: session.id,
    transactionAmount: Number(session.amount),
    description: `Pedido Tyer — sessão ${session.id}`,
    token,
    installments: installments || 1,
    paymentMethodId: payment_method_id,
    payer: {
      email: payer.email,
      identification: payer.cpf ? { type: "CPF", number: payer.cpf } : undefined,
    },
    externalReference: session.id,
  });

  await paymentModuleService.updatePaymentSession({
    id: session.id,
    amount: session.amount,
    currency_code: session.currency_code,
    data: { status: "submitted", mp_payment_id: payment.id, mp_status: payment.status },
  });

  return res.json({ status: payment.status, status_detail: payment.status_detail });
}
