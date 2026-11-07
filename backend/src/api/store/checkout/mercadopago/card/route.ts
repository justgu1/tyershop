import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { isValidCpf } from "../../../../../utils/cpf";
import { emailProblem } from "../../../../../utils/email";
import { buildAdditionalInfo } from "../../../../../modules/payment-mercadopago/additional-info";
import { getMercadoPagoClient, getMercadoPagoPaymentSession, guardedPayment, loadAntifraudCart, toAmount } from "../utils";

type Body = {
  payment_session_id: string;
  /** Token gerado no browser via Secure Fields do Mercado Pago — nunca o número do cartão. */
  token: string;
  /** Opcional — o Mercado Pago infere a bandeira a partir do token. */
  payment_method_id?: string;
  installments: number;
  /** `MP_DEVICE_SESSION_ID` do SDK do Mercado Pago; melhora a aprovação no antifraude. */
  device_id?: string;
  payer: {
    email: string;
    first_name?: string;
    last_name?: string;
    cpf?: string;
  };
};

/**
 * Confirma um pagamento com cartão. Uma cobrança por sessão: repetir a chamada com a sessão já paga ou
 * em análise devolve o pagamento existente em vez de cobrar de novo; só uma recusa libera nova tentativa.
 */
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { payment_session_id, token, payment_method_id, installments, payer, device_id } = req.body ?? ({} as Body);
  if (!payment_session_id || !token || !payer?.email) {
    return res.status(400).json({ message: "payment_session_id, token e payer.email são obrigatórios." });
  }
  const emailError = emailProblem(payer.email);
  if (emailError) return res.status(400).json({ message: emailError });
  if (!isValidCpf(payer.cpf)) {
    return res.status(400).json({ message: "Informe um CPF válido: sem ele não conseguimos emitir a etiqueta de envio." });
  }
  const parcels = Math.floor(Number(installments) || 1);
  if (parcels < 1 || parcels > 12) {
    return res.status(400).json({ message: "Número de parcelas inválido." });
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
      client.createCardPayment({
        idempotencyKey,
        transactionAmount: amount,
        description: `Pedido Tyer — sessão ${session.id}`,
        token,
        installments: parcels,
        paymentMethodId: payment_method_id,
        payer: {
          email: payer.email,
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
        data: { status: "submitted", mp_payment_id: created.id, mp_status: created.status, method: "card", mp_amount: amount, amount, attempt },
      });
    }
  );

  return res.json({ status: payment.status, status_detail: payment.status_detail });
}
