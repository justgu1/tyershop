import {
  AbstractPaymentProvider,
  BigNumber,
  isDefined,
  MedusaError,
} from "@medusajs/framework/utils";
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";
import { MercadoPagoClient, type MercadoPagoPayment } from "./client";

type Options = {
  accessToken: string;
  publicKey: string;
  /** URL pública do backend p/ o webhook, ex.: https://api.tyershop.com/hooks/payment/mercadopago */
  notificationUrl?: string;
};

type InjectedDependencies = {
  logger: Logger;
};

/**
 * Status intermediário guardado em `PaymentSession.data` enquanto o cliente
 * ainda não escolheu/confirmou o método (cartão via Secure Fields, Pix ou
 * boleto). Vira um pagamento de verdade no Mercado Pago só quando um dos
 * nossos endpoints `/store/checkout/mercadopago/*` é chamado pelo frontend.
 */
type PendingSessionData = {
  status: "pending_method";
  amount: number;
  currency_code: string;
};

type ConfirmedSessionData = {
  status: "submitted";
  mp_payment_id: number;
  mp_status: MercadoPagoPayment["status"];
};

type SessionData = PendingSessionData | ConfirmedSessionData | Record<string, unknown>;

/** Mapa 1:1 entre status do Mercado Pago e o vocabulário do Medusa. */
export function mapMpStatusToMedusa(status: MercadoPagoPayment["status"]): "authorized" | "pending" | "canceled" | "error" {
  switch (status) {
    case "approved":
    case "authorized":
      return "authorized";
    case "pending":
    case "in_process":
    case "in_mediation":
      return "pending";
    case "cancelled":
      return "canceled";
    case "rejected":
      return "error";
    default:
      return "pending";
  }
}

/**
 * Provider real do Mercado Pago (checkout transparente puro — sem Bricks).
 * Implementa a porta `AbstractPaymentProvider` do Medusa; todo o HTTP fica em
 * `MercadoPagoClient` (client.ts).
 *
 * Fluxo (ver backend/src/api/store/checkout/mercadopago/*):
 *  1. `initiatePayment` — chamado assim que o carrinho cria a sessão de
 *     pagamento p/ este provider. Ainda não sabemos cartão/Pix/boleto, então
 *     só guardamos um estado "pending_method".
 *  2. Frontend chama nosso endpoint (pix, boleto, ou cartão já com o token do
 *     Secure Fields) → esse endpoint cria o pagamento de verdade no Mercado
 *     Pago e atualiza a `PaymentSession.data` com o `mp_payment_id`.
 *  3. `authorizePayment` — roda quando o carrinho é completado; lê o status
 *     mais recente no Mercado Pago e autoriza (ou deixa "pending" p/ Pix e
 *     boleto, que confirmam depois via webhook).
 *  4. `getWebhookActionAndData` — recebe a notificação do Mercado Pago e
 *     fecha o ciclo (autoriza/captura o pagamento pendente).
 */
class MercadoPagoProviderService extends AbstractPaymentProvider<Options> {
  static identifier = "mercadopago";

  protected readonly logger_: Logger;
  protected readonly options_: Options;
  protected readonly client_: MercadoPagoClient;

  static validateOptions(options: Record<string, unknown>) {
    if (!isDefined(options.accessToken)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `accessToken` (Mercado Pago Access Token) é obrigatória no provider mercadopago."
      );
    }
    if (!isDefined(options.publicKey)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `publicKey` (Mercado Pago Public Key) é obrigatória no provider mercadopago."
      );
    }
  }

  constructor(cradle: InjectedDependencies, options: Options) {
    super(cradle, options);
    this.logger_ = cradle.logger;
    this.options_ = options;
    this.client_ = new MercadoPagoClient({
      accessToken: options.accessToken,
      notificationUrl: options.notificationUrl,
    });
  }

  get client(): MercadoPagoClient {
    return this.client_;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const amount = Number(input.amount);
    const data: PendingSessionData = {
      status: "pending_method",
      amount,
      currency_code: input.currency_code,
    };
    return { id: `mp_pending_${Date.now()}`, data };
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // Método/valor ainda não confirmados no Mercado Pago — só refletimos o
    // novo valor localmente (ex.: troca de frete no carrinho).
    return { data: { ...input.data, amount: Number(input.amount) } };
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const data = input.data as SessionData;

    if (!("mp_payment_id" in data)) {
      // Cliente tentou fechar o pedido sem passar por nenhum dos nossos
      // endpoints de confirmação (cartão/Pix/boleto) antes.
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Nenhum pagamento Mercado Pago foi confirmado para esta sessão ainda."
      );
    }

    const confirmed = data as ConfirmedSessionData;
    const payment = await this.client_.getPayment(confirmed.mp_payment_id);
    const status = mapMpStatusToMedusa(payment.status);

    return {
      status,
      data: { ...confirmed, mp_status: payment.status },
    };
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    // Todos os pagamentos são criados com captura automática (cartão à
    // vista/parcelado, Pix e boleto não têm captura manual no Mercado Pago).
    return { data: input.data };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const data = input.data as ConfirmedSessionData;
    if (data?.mp_payment_id) {
      await this.client_.cancelPayment(data.mp_payment_id);
    }
    return { data: input.data };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    const data = input.data as ConfirmedSessionData;
    if (data?.mp_payment_id) {
      await this.client_.cancelPayment(data.mp_payment_id).catch(() => {
        // já capturado/expirado — nada a fazer
      });
    }
    return { data: input.data };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = input.data as ConfirmedSessionData;
    await this.client_.refundPayment(data.mp_payment_id, Number(input.amount));
    return { data: input.data };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const data = input.data as ConfirmedSessionData;
    if (!data?.mp_payment_id) return { data: input.data };
    const payment = await this.client_.getPayment(data.mp_payment_id);
    return { data: { ...data, mp_status: payment.status } };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const data = input.data as SessionData;
    if (!("mp_payment_id" in data)) return { status: "pending" };
    const confirmed = data as ConfirmedSessionData;
    const payment = await this.client_.getPayment(confirmed.mp_payment_id);
    return { status: mapMpStatusToMedusa(payment.status), data: { ...confirmed, mp_status: payment.status } };
  }

  async getWebhookActionAndData(payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    const body = payload.data as { type?: string; action?: string; data?: { id?: string } };
    try {
      if (body?.type !== "payment" || !body?.data?.id) {
        return { action: "not_supported", data: { session_id: "", amount: new BigNumber(0) } };
      }

      const payment = await this.client_.getPayment(body.data.id);
      const sessionId = String(payment.external_reference ?? "");
      const amount = new BigNumber(payment.transaction_amount);

      switch (payment.status) {
        case "approved":
        case "authorized":
          return { action: "captured", data: { session_id: sessionId, amount } };
        case "rejected":
        case "cancelled":
          return { action: "failed", data: { session_id: sessionId, amount } };
        default:
          return { action: "not_supported", data: { session_id: sessionId, amount } };
      }
    } catch (err) {
      this.logger_.error(`[mercadopago] falha ao processar webhook: ${(err as Error).message}`);
      return { action: "not_supported", data: { session_id: "", amount: new BigNumber(0) } };
    }
  }
}

export default MercadoPagoProviderService;
