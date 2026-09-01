/**
 * Adapter puro: só fala HTTP com a API do Mercado Pago. Sem nenhum
 * conhecimento de Medusa (cart, payment session, etc) — isso fica em
 * `service.ts`, que é quem implementa a porta (`AbstractPaymentProvider`).
 *
 * Docs: https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post
 */

const MP_API_BASE = "https://api.mercadopago.com";

export type MercadoPagoClientOptions = {
  accessToken: string;
  /** URL pública do nosso backend para receber o webhook (opcional, pode ser fixa por env). */
  notificationUrl?: string;
};

export type CreateCardPaymentInput = {
  /** Idempotência: usar o id da payment session do Medusa. */
  idempotencyKey: string;
  /** Valor em unidade "major" (ex.: 149.90), não em centavos — a API do MP usa decimal. */
  transactionAmount: number;
  description: string;
  /** Token gerado no browser via SDK do Mercado Pago (nunca o número do cartão). */
  token: string;
  installments: number;
  paymentMethodId: string;
  payer: { email: string; identification?: { type: string; number: string } };
  externalReference: string;
};

export type CreatePixPaymentInput = {
  idempotencyKey: string;
  transactionAmount: number;
  description: string;
  payer: { email: string; firstName?: string; lastName?: string; identification?: { type: string; number: string } };
  externalReference: string;
};

export type CreateBoletoPaymentInput = CreatePixPaymentInput & {
  payer: CreatePixPaymentInput["payer"] & {
    address: {
      zipCode: string;
      streetName: string;
      streetNumber: string;
      neighborhood: string;
      city: string;
      federalUnit: string;
    };
  };
};

export type MercadoPagoPayment = {
  id: number;
  status: "pending" | "approved" | "authorized" | "in_process" | "in_mediation" | "rejected" | "cancelled" | "refunded" | "charged_back";
  status_detail: string;
  transaction_amount: number;
  external_reference?: string;
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
      throw new Error(`[mercadopago] ${message}`);
    }
    return body as T;
  }

  async createCardPayment(input: CreateCardPaymentInput): Promise<MercadoPagoPayment> {
    return this.request<MercadoPagoPayment>("/v1/payments", {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: JSON.stringify({
        transaction_amount: input.transactionAmount,
        token: input.token,
        description: input.description,
        installments: input.installments,
        payment_method_id: input.paymentMethodId,
        payer: {
          email: input.payer.email,
          identification: input.payer.identification,
        },
        external_reference: input.externalReference,
        notification_url: this.options.notificationUrl,
      }),
    });
  }

  async createPixPayment(input: CreatePixPaymentInput): Promise<MercadoPagoPayment> {
    return this.request<MercadoPagoPayment>("/v1/payments", {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: JSON.stringify({
        transaction_amount: input.transactionAmount,
        description: input.description,
        payment_method_id: "pix",
        payer: {
          email: input.payer.email,
          first_name: input.payer.firstName,
          last_name: input.payer.lastName,
          identification: input.payer.identification,
        },
        external_reference: input.externalReference,
        notification_url: this.options.notificationUrl,
      }),
    });
  }

  async createBoletoPayment(input: CreateBoletoPaymentInput): Promise<MercadoPagoPayment> {
    return this.request<MercadoPagoPayment>("/v1/payments", {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: JSON.stringify({
        transaction_amount: input.transactionAmount,
        description: input.description,
        payment_method_id: "bolbradesco",
        payer: {
          email: input.payer.email,
          first_name: input.payer.firstName,
          last_name: input.payer.lastName,
          identification: input.payer.identification,
          address: {
            zip_code: input.payer.address.zipCode,
            street_name: input.payer.address.streetName,
            street_number: input.payer.address.streetNumber,
            neighborhood: input.payer.address.neighborhood,
            city: input.payer.address.city,
            federal_unit: input.payer.address.federalUnit,
          },
        },
        external_reference: input.externalReference,
        notification_url: this.options.notificationUrl,
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
