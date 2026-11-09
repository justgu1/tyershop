/**
 * Adapter puro: só fala HTTP com a API do Mercado Pago. Sem nenhum
 * conhecimento de Medusa (cart, payment session, etc) — isso fica em
 * `service.ts`, que é quem implementa a porta (`AbstractPaymentProvider`).
 *
 * Docs: https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post
 */

import { MedusaError } from "@medusajs/framework/utils";
import { pixExpiration } from "./pix-expiration";

/**
 * Mensagem em português para o cliente a partir do erro cru do Mercado Pago (que fica só no log). Recusa de cartão não passa
 * por aqui: ela volta como pagamento `rejected`, com motivo próprio.
 */
export function friendlyMercadoPagoError(raw: string, status: number): { message: string; type: string } {
  const text = raw.toLowerCase();
  if (status >= 500) return { message: "O Mercado Pago está indisponível agora. Tente de novo em instantes.", type: MedusaError.Types.UNEXPECTED_STATE };
  if (text.includes("email")) return { message: "O Mercado Pago não aceitou o e-mail informado para o pagamento. Use outro e-mail.", type: MedusaError.Types.INVALID_DATA };
  if (text.includes("token")) return { message: "Os dados do cartão expiraram. Digite o cartão de novo.", type: MedusaError.Types.INVALID_DATA };
  if (text.includes("identification") || text.includes("cpf")) return { message: "O CPF informado não foi aceito. Confira e tente de novo.", type: MedusaError.Types.INVALID_DATA };
  return { message: "O Mercado Pago não aceitou o pagamento. Confira os dados e tente de novo.", type: MedusaError.Types.INVALID_DATA };
}

/** `MERCADOPAGO_API_BASE` só existe para apontar o simulador no teste de carga. */
const MP_API_BASE = process.env.MERCADOPAGO_API_BASE?.replace(/\/$/, "") || "https://api.mercadopago.com";

export type MercadoPagoClientOptions = {
  accessToken: string;
  /** URL pública do nosso backend para receber o webhook (opcional, pode ser fixa por env). */
  notificationUrl?: string;
};

/** Nome na fatura do cartão (máx. 16 caracteres no Mercado Pago). */
export const STATEMENT_DESCRIPTOR = "TYERSHOP"

export type CreateCardPaymentInput = {
  /** Idempotência: usar o id da payment session do Medusa. */
  idempotencyKey: string;
  /** Valor em unidade "major" (ex.: 149.90), não em centavos — a API do MP usa decimal. */
  transactionAmount: number;
  description: string;
  /** Token gerado no browser via SDK do Mercado Pago (nunca o número do cartão). */
  token: string;
  installments: number;
  /** Opcional — o Mercado Pago infere a bandeira a partir do token sozinho. */
  paymentMethodId?: string;
  /** Emissor do cartão (vem do SDK pelo bin); o painel de qualidade cobra o campo. */
  issuerId?: string;
  payer: { email: string; firstName?: string; lastName?: string; identification?: { type: string; number: string } };
  externalReference: string;
  /** Device ID do SDK do Mercado Pago no browser, usado pelo antifraude. */
  deviceId?: string;
  additionalInfo?: Record<string, unknown>;
};

export type CreatePixPaymentInput = {
  idempotencyKey: string;
  transactionAmount: number;
  description: string;
  payer: { email: string; firstName?: string; lastName?: string; identification?: { type: string; number: string } };
  externalReference: string;
  /** Device ID do SDK no browser, usado pelo antifraude. */
  deviceId?: string;
  additionalInfo?: Record<string, unknown>;
};


export type MercadoPagoPayment = {
  id: number;
  status: "pending" | "approved" | "authorized" | "in_process" | "in_mediation" | "rejected" | "cancelled" | "refunded" | "charged_back";
  status_detail: string;
  transaction_amount: number;
  external_reference?: string;
  date_of_expiration?: string | null;
  payer?: { identification?: { type?: string; number?: string } };
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  transaction_details?: {
    external_resource_url?: string; // boleto
    verification_code?: string;
  };
  [key: string]: unknown;
};

export class MercadoPagoClient {
  constructor(private readonly options: MercadoPagoClientOptions) {}

  /** `''`/undefined viram `undefined` — mandar string vazia faz o Mercado Pago rejeitar o payload inteiro. */
  private get notificationUrl(): string | undefined {
    const url = this.options.notificationUrl?.trim();
    return url ? url : undefined;
  }

  private async request<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;

    const res = await fetch(`${MP_API_BASE}${path}`, { ...init, headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = (body as any)?.message || (body as any)?.error || `Mercado Pago respondeu ${res.status}`;
      console.error(`[mercadopago] ${res.status} ${path}: ${message}`);
      const friendly = friendlyMercadoPagoError(String(message), res.status);
      throw new MedusaError(friendly.type as any, friendly.message);
    }
    return body as T;
  }

  async createCardPayment(input: CreateCardPaymentInput): Promise<MercadoPagoPayment> {
    return this.request<MercadoPagoPayment>("/v1/payments", {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      headers: input.deviceId ? { "X-meli-session-id": input.deviceId } : undefined,
      body: JSON.stringify({
        transaction_amount: input.transactionAmount,
        token: input.token,
        description: input.description,
        installments: input.installments,
        payment_method_id: input.paymentMethodId,
        issuer_id: input.issuerId,
        payer: {
          email: input.payer.email,
          first_name: input.payer.firstName,
          last_name: input.payer.lastName,
          identification: input.payer.identification,
        },
        additional_info: input.additionalInfo,
        statement_descriptor: STATEMENT_DESCRIPTOR,
        external_reference: input.externalReference,
        notification_url: this.notificationUrl,
      }),
    });
  }

  async createPixPayment(input: CreatePixPaymentInput): Promise<MercadoPagoPayment> {
    return this.request<MercadoPagoPayment>("/v1/payments", {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      headers: input.deviceId ? { "X-meli-session-id": input.deviceId } : undefined,
      body: JSON.stringify({
        transaction_amount: input.transactionAmount,
        description: input.description,
        payment_method_id: "pix",
        date_of_expiration: pixExpiration(),
        payer: {
          email: input.payer.email,
          first_name: input.payer.firstName,
          last_name: input.payer.lastName,
          identification: input.payer.identification,
        },
        additional_info: input.additionalInfo,
        external_reference: input.externalReference,
        notification_url: this.notificationUrl,
      }),
    });
  }

  async getPayment(paymentId: string | number): Promise<MercadoPagoPayment> {
    return this.request<MercadoPagoPayment>(`/v1/payments/${paymentId}`, { method: "GET" });
  }

  async cancelPayment(paymentId: string | number): Promise<MercadoPagoPayment> {
    return this.request<MercadoPagoPayment>(`/v1/payments/${paymentId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "cancelled" }),
    });
  }

  async refundPayment(paymentId: string | number, amount?: number): Promise<unknown> {
    return this.request(`/v1/payments/${paymentId}/refunds`, {
      method: "POST",
      body: amount ? JSON.stringify({ amount }) : undefined,
    });
  }
}
