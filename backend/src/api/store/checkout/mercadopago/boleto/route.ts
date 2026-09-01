import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getMercadoPagoClient, getMercadoPagoPaymentSession } from "../utils";

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

/**
 * Confirma um pagamento por boleto. Assim como o Pix, 100% backend — o
 * frontend só coleta os dados do pagador e mostra o link/código de volta.
 */
export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const { payment_session_id, payer } = req.body ?? ({} as Body);
  if (!payment_session_id || !payer?.email || !payer?.cpf || !payer?.address) {
    return res.status(400).json({ message: "payment_session_id, payer.email, payer.cpf e payer.address são obrigatórios." });
  }

  const client = getMercadoPagoClient();
  const { paymentModuleService, session } = await getMercadoPagoPaymentSession(req, payment_session_id);

  const payment = await client.createBoletoPayment({
    idempotencyKey: session.id,
    transactionAmount: Number(session.amount),
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
  });

  await paymentModuleService.updatePaymentSession({
    id: session.id,
    data: { status: "submitted", mp_payment_id: payment.id, mp_status: payment.status },
  });

  return res.json({
    status: payment.status,
    boleto_url: payment.transaction_details?.external_resource_url ?? null,
    barcode: payment.transaction_details?.verification_code ?? null,
  });
}
