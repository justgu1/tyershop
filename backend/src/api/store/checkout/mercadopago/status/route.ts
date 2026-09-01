import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { mapMpStatusToMedusa } from "../../../../../modules/payment-mercadopago/service";
import { getMercadoPagoClient, getMercadoPagoPaymentSession } from "../utils";

/**
 * Status atual do pagamento (consulta o Mercado Pago de novo, não só o que
 * já tá salvo). Pix e boleto ficam "pending" até o cliente pagar de fato —
 * o frontend faz polling aqui em vez de depender só do webhook (que exige
 * uma URL pública, indisponível em dev local).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const paymentSessionId = String(req.query.payment_session_id ?? "");
  if (!paymentSessionId) {
    return res.status(400).json({ message: "payment_session_id é obrigatório." });
  }

  const { session } = await getMercadoPagoPaymentSession(req, paymentSessionId);
  const data = session.data as { mp_payment_id?: number };

  if (!data?.mp_payment_id) {
    return res.json({ status: "pending_method" });
  }

  const client = getMercadoPagoClient();
  const payment = await client.getPayment(data.mp_payment_id);

  return res.json({ status: mapMpStatusToMedusa(payment.status), mp_status: payment.status });
}
