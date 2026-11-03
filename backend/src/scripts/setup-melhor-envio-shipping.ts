import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createShippingOptionsWorkflow, deleteShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"
import { SERVICES } from "../modules/melhor-envio/quote"

/**
 * Cria uma opção de envio calculada pelo Melhor Envio para cada serviço e remove o frete fixo antigo.
 * Idempotente: rode de novo sem medo (só cria o que falta).
 *   npx medusa exec ./src/scripts/setup-melhor-envio-shipping.ts
 */
export default async function setup({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillment = container.resolve(Modules.FULFILLMENT) as any
  const logger = container.resolve("logger")

  // O provedor precisa estar ligado ao local de estoque antes de aparecer em opções de envio.
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id", "fulfillment_providers.id"] })
  for (const loc of locations as any[]) {
    if (!(loc.fulfillment_providers ?? []).some((p: any) => p.id === "melhorenvio_melhorenvio")) {
      await link.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: loc.id },
        [Modules.FULFILLMENT]: { fulfillment_provider_id: "melhorenvio_melhorenvio" },
      })
    }
  }

  const [zone] = await fulfillment.listServiceZones({ name: "Brasil" }, { take: 1 })
  const [profile] = await fulfillment.listShippingProfiles({ type: "default" }, { take: 1 })
  if (!zone || !profile) throw new Error("Zona de serviço 'Brasil' ou perfil de envio padrão não encontrado: rode o setup da loja antes.")

  const existing = await fulfillment.listShippingOptions({}, { relations: ["type"], take: 100 })
  const have = new Set(existing.filter((o: any) => o.provider_id === "melhorenvio_melhorenvio").map((o: any) => String(o.data?.id)))

  const toCreate = Object.entries(SERVICES)
    .filter(([id]) => !have.has(`melhorenvio-${id}`))
    .map(([id, name]) => ({
      name,
      price_type: "calculated" as const,
      provider_id: "melhorenvio_melhorenvio",
      service_zone_id: zone.id,
      shipping_profile_id: profile.id,
      type: { label: name, description: `Entrega por ${name}`, code: `melhorenvio-${id}` },
      data: { id: `melhorenvio-${id}` },
      rules: [
        { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
        { attribute: "is_return", value: "false", operator: "eq" as const },
      ],
    }))

  if (toCreate.length) {
    await createShippingOptionsWorkflow(container).run({ input: toCreate as any })
    logger.info(`Melhor Envio: ${toCreate.length} opções de envio criadas`)
  }

  // Serviço que saiu de SERVICES (ex.: Jadlog) deixa de aparecer no checkout.
  const outdated = existing.filter(
    (o: any) => o.provider_id === "melhorenvio_melhorenvio" && !(String(o.data?.id).replace("melhorenvio-", "") in SERVICES)
  )
  if (outdated.length) {
    await deleteShippingOptionsWorkflow(container).run({ input: { ids: outdated.map((o: any) => o.id) } })
    logger.info(`Opções removidas: ${outdated.map((o: any) => o.name).join(", ")}`)
  }

  const flat = existing.filter((o: any) => o.provider_id === "manual_manual" && o.price_type === "flat")
  if (flat.length) {
    await deleteShippingOptionsWorkflow(container).run({ input: { ids: flat.map((o: any) => o.id) } })
    logger.info(`Frete fixo removido: ${flat.map((o: any) => o.name).join(", ")}`)
  }

  await query.graph({ entity: "shipping_option", fields: ["id", "name", "price_type", "provider_id"] }).then(({ data }) => {
    logger.info(`Opções de envio agora: ${(data as any[]).map((o) => `${o.name}(${o.price_type})`).join(", ")}`)
  })
}
