import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";

// Base mínima de um banco novo: canal, região Brasil, estoque, zona de entrega e chave publicável (sem produtos).
// Idempotente. Depois: enable-mercadopago-provider.ts e setup-melhor-envio-shipping.ts.
export default async function setupProducao({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillment = container.resolve(Modules.FULFILLMENT);
  const salesChannels = container.resolve(Modules.SALES_CHANNEL);
  const [store] = await container.resolve(Modules.STORE).listStores();

  let [salesChannel] = await salesChannels.listSalesChannels({ name: "Default Sales Channel" });
  if (!salesChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "Default Sales Channel" }] },
    });
    salesChannel = result[0];
  }
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: { default_sales_channel_id: salesChannel.id, supported_currencies: [{ currency_code: "brl", is_default: true }] },
    },
  });

  const { data: regions } = await query.graph({ entity: "region", fields: ["id", "currency_code"] });
  let region: any = (regions as any[]).find((r) => r.currency_code === "brl");
  if (!region) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          { name: "Brasil", currency_code: "brl", countries: ["br"], payment_providers: ["pp_mercadopago_mercadopago"] },
        ],
      },
    });
    region = result[0];
  }
  await createTaxRegionsWorkflow(container)
    .run({ input: [{ country_code: "br", provider_id: "tp_system" }] })
    .catch(() => logger.info("Tax region BR já existe."));

  const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id", "name"] });
  let stockLocation: any = (locations as any[]).find((l) => l.name === "Estoque Principal");
  if (!stockLocation) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: { locations: [{ name: "Estoque Principal", address: { city: "Sao Paulo", country_code: "BR", address_1: "" } }] },
    });
    stockLocation = result[0];
    await updateStoresWorkflow(container).run({
      input: { selector: { id: store.id }, update: { default_location_id: stockLocation.id } },
    });
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    });
  }

  let [profile] = await fulfillment.listShippingProfiles({ type: "default" });
  if (!profile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    });
    profile = result[0];
  }

  const [existingSet] = await fulfillment.listFulfillmentSets({ name: "Entrega Brasil" });
  if (!existingSet) {
    const set = await fulfillment.createFulfillmentSets({
      name: "Entrega Brasil",
      type: "shipping",
      service_zones: [{ name: "Brasil", geo_zones: [{ country_code: "br", type: "country" }] }],
    });
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: set.id },
    });
  }

  await linkSalesChannelsToStockLocationWorkflow(container)
    .run({ input: { id: stockLocation.id, add: [salesChannel.id] } })
    .catch(() => {});

  const { data: keys } = await query.graph({ entity: "api_key", fields: ["id", "token"], filters: { type: "publishable" } });
  let key: any = (keys as any[])[0];
  if (!key) {
    const {
      result: [created],
    } = await createApiKeysWorkflow(container).run({
      input: { api_keys: [{ title: "Tyer Storefront", type: "publishable", created_by: "" }] },
    });
    key = created;
    await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: key.id, add: [salesChannel.id] } });
  }

  logger.info(`REGION_ID=${region.id}`);
  logger.info(`PUBLISHABLE_KEY=${key.token}`);
}
