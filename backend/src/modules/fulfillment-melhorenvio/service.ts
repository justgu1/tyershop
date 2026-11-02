import { AbstractFulfillmentProviderService, MedusaError } from "@medusajs/framework/utils"
import { container as appContainer } from "@medusajs/framework"
import { buildPackage, quotePackage, SERVICES } from "../melhor-envio/quote"

/**
 * Frete calculado no Melhor Envio. Cada serviço (PAC, SEDEX...) vira uma opção de envio do Medusa; o preço
 * é sempre calculado aqui, no servidor, a partir do carrinho e do CEP de entrega: o cliente não influencia o valor.
 * A etiqueta é comprada à mão no painel do Melhor Envio. O provedor roda isolado dentro do módulo de frete,
 * então usa o contêiner principal da aplicação para chegar ao token e às variantes.
 */
class MelhorEnvioFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "melhorenvio"

  async getFulfillmentOptions() {
    return Object.entries(SERVICES).map(([id, name]) => ({ id: `melhorenvio-${id}`, name }))
  }

  async validateFulfillmentData(_optionData: Record<string, unknown>, data: Record<string, unknown>) {
    return data
  }

  async validateOption(data: Record<string, unknown>) {
    return String(data.id ?? "").startsWith("melhorenvio-")
  }

  async canCalculate() {
    return true
  }

  async calculatePrice(optionData: Record<string, any>, _data: Record<string, any>, context: Record<string, any>) {
    const serviceId = String(optionData.id ?? "").replace("melhorenvio-", "")
    const zip = context.shipping_address?.postal_code
    if (!zip) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Informe o CEP de entrega para calcular o frete.")

    const items = (context.items ?? []).map((i: any) => ({
      variant_id: i.variant_id ?? i.variant?.id,
      quantity: i.quantity,
      weight: i.variant?.weight,
      length: i.variant?.length,
      width: i.variant?.width,
      height: i.variant?.height,
    }))
    const quote = (await quotePackage(appContainer, zip, buildPackage(items))).find((q) => q.id === serviceId)
    if (!quote) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Este serviço de entrega não atende o CEP informado.")

    return { calculated_amount: quote.price, is_calculated_price_tax_inclusive: false }
  }

  async createFulfillment() {
    return { data: {}, labels: [] }
  }

  async cancelFulfillment() {
    return {}
  }

  async createReturnFulfillment() {
    return { data: {}, labels: [] }
  }
}

export default MelhorEnvioFulfillmentService
