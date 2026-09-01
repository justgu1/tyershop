import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getMercadoPagoClient, getMercadoPagoPaymentSession } from "../utils";

type Body = {
  payment_session_id: string;
  payer: {
    email: string;
    first_name?: string;
    last_name?: string;
    cpf?: string;
  };
};

/**
 * Confirma um pagamento Pix. O frontend chama isto depois que o cliente
 * escolhe "Pix" no checkout — não precisa de token nem SDK, é 100% backend.
 * Devolve o QR code (copia-e-cola + imagem) pro frontend só exibir.
 */
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { payment_session_id, payer } = req.body ?? ({} as Body);
  if (!payment_session_id || !payer?.email) {
    return res.status(400).json({ message: "payment_session_id e payer.email são obrigatórios." });
  }

  const client = getMercadoPagoClient();
  const { paymentModuleService, session } = await getMercadoPagoPaymentSession(req, payment_session_id);

  const payment = await client.createPixPayment({
    idempotencyKey: session.id,
    transactionAmount: Number(session.amount),
    description: `Pedido Tyer — sessão ${session.id}`,
    payer: {
      email: payer.email,
      firstName: payer.first_name,
      lastName: payer.last_name,
      identification: payer.cpf ? { type: "CPF", number: payer.cpf } : undefined,
    },
    externalReference: session.id,
  });

  await paymentModuleService.updatePaymentSession({
    id: session.id,
    data: { status: "submitted", mp_payment_id: payment.id, mp_status: payment.status },
  });

  return res.json({
    status: payment.status,
    qr_code: payment.point_of_interaction?.transaction_data?.qr_code ?? null,
    qr_code_base64: payment.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
  });
}
