import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getMercadoPagoClient, getMercadoPagoPaymentSession, guardedPayment, toAmount } from "../utils";

type Body = {
  payment_session_id: string;
  payer: {
    email: string;
    first_name: string;
    last_name: string;
    cpf: string;
    address: {
      zip_code: string;
      street_name: string;
      street_number: string;
      neighborhood: string;
      city: string;
      federal_unit: string;
    };
  };
};

/** Confirma um pagamento por boleto, com as mesmas garantias do Pix (ver `guardedPayment`). */
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { payment_session_id, payer } = req.body ?? ({} as Body);
  if (!payment_session_id || !payer?.email || !payer?.cpf || !payer?.address) {
    return res.status(400).json({ message: "payment_session_id, payer.email, payer.cpf e payer.address são obrigatórios." });
  }

  const client = getMercadoPagoClient();
  const { paymentModuleService, session } = await getMercadoPagoPaymentSession(req, payment_session_id);
  const amount = toAmount(session.amount);

  const { payment } = await guardedPayment(
    req,
    session as any,
    (idempotencyKey) =>
      client.createBoletoPayment({
        idempotencyKey,
        transactionAmount: amount,
        description: `Pedido Tyer — sessão ${session.id}`,
        payer: {
          email: payer.email,
          firstName: payer.first_name,
          lastName: payer.last_name,
          identification: { type: "CPF", number: payer.cpf },
          address: {
            zipCode: payer.address.zip_code,
            streetName: payer.address.street_name,
            streetNumber: payer.address.street_number,
            neighborhood: payer.address.neighborhood,
            city: payer.address.city,
            federalUnit: payer.address.federal_unit,
          },
        },
        externalReference: session.id,
      }),
    async (created, attempt) => {
      await paymentModuleService.updatePaymentSession({
        id: session.id,
        amount: session.amount,
        currency_code: session.currency_code,
        data: { status: "submitted", mp_payment_id: created.id, mp_status: created.status, mp_amount: amount, amount, attempt },
      });
    }
  );

  return res.json({
    status: payment.status,
    boleto_url: payment.transaction_details?.external_resource_url ?? null,
    barcode: payment.transaction_details?.verification_code ?? null,
  });
}
