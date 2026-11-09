import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { isValidCpf } from "../../../../../utils/cpf";
import { emailProblem } from "../../../../../utils/email";
import { buildAdditionalInfo } from "../../../../../modules/payment-mercadopago/additional-info";
import { getMercadoPagoClient, getMercadoPagoPaymentSession, guardedPayment, loadAntifraudCart, toAmount } from "../utils";

type Body = {
  payment_session_id: string;
  /** `MP_DEVICE_SESSION_ID` do SDK do Mercado Pago. */
  device_id?: string;
  payer: {
    email: string;
    first_name?: string;
    last_name?: string;
    cpf?: string;
  };
};

/**
 * Confirma um pagamento Pix. O valor vem sempre da sessão (nunca do body) e a cobrança só sai
 * para a conta dona do carrinho, uma vez por sessão (ver `guardedPayment`).
 */
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { payment_session_id, payer, device_id } = req.body ?? ({} as Body);
  if (!payment_session_id || !payer?.email) {
    return res.status(400).json({ message: "payment_session_id e payer.email são obrigatórios." });
  }

  const emailError = emailProblem(payer.email);
  if (emailError) return res.status(400).json({ message: emailError });
  if (!isValidCpf(payer.cpf)) {
    return res.status(400).json({ message: "Informe um CPF válido: sem ele não conseguimos emitir a etiqueta de envio." });
  }
  const client = getMercadoPagoClient();
  const { paymentModuleService, session } = await getMercadoPagoPaymentSession(req, payment_session_id);
  const amount = toAmount(session.amount);
  const additionalInfo = buildAdditionalInfo(await loadAntifraudCart(req, session), {
    firstName: payer.first_name,
    lastName: payer.last_name,
  });

  const { payment } = await guardedPayment(
    req,
    session as any,
    amount,
    (idempotencyKey) =>
      client.createPixPayment({
        idempotencyKey,
        transactionAmount: amount,
        description: `Pedido Tyer — sessão ${session.id}`,
        payer: {
          email: payer.email,
          firstName: payer.first_name,
          lastName: payer.last_name,
          identification: payer.cpf ? { type: "CPF", number: payer.cpf } : undefined,
        },
        externalReference: session.id,
        deviceId: typeof device_id === "string" && device_id ? device_id : undefined,
        additionalInfo,
      }),
    async (created, attempt) => {
      await paymentModuleService.updatePaymentSession({
        id: session.id,
        amount: session.amount,
        currency_code: session.currency_code,
        data: {
          status: "submitted",
          mp_payment_id: created.id,
          mp_status: created.status, method: "pix",
          // Valor cobrado no Mercado Pago: se o carrinho mudar depois do pagamento, a autorização recusa.
          mp_amount: amount,
          amount,
          attempt,
        },
      });
    }
  );

  return res.json({
    status: payment.status,
    qr_code: payment.point_of_interaction?.transaction_data?.qr_code ?? null,
    qr_code_base64: payment.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
    expires_at: payment.date_of_expiration ?? null,
  });
}
