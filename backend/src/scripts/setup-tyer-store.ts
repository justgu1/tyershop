import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { ExecArgs, CreateInventoryLevelInput } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createCollectionsWorkflow,
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";

// Titulos das colecoes, derivados dos handles de produto agrupados por
// "Product Collection Id" no CSV (os IDs originais sao de outro ambiente
// e nao existem nesta base local, entao recriamos as colecoes por titulo).
const COLLECTION_TITLE_BY_CSV_ID: Record<string, string> = {
  pcol_01M1BKGAMS7VA1Y2ZQVM1S5AZN: "Five Stars Only",
  pcol_01M1BKGAN9HCDBT83TT3TR7ZVV: "Red Rose",
  pcol_01M1BKGANPSQ176H5H9600D43N: "Tyer Day",
  pcol_01M1BKGAP27PDPMC39AMF03Q48: "Tyer In Paris",
  pcol_01M1BKGAPFFDYR272NW7VPCSC3: "Savage Mode",
  pcol_01M1BKGAPVC42W66KCN0VB9Z22: "Tyer Tech",
  pcol_01M1BKGAQ6HXGYMWP559XT4KBM: "Tyer Starter",
  pcol_01M1BKGAQHHG9JZVCZBQ0VNK83: "MVP",
  pcol_01M1BKGAQZX8EP3N3FCXH1CBBP: "Tyer Pro",
};

const HTML_ENTITIES: Record<string, string> = {
  Atilde: "Ã", Ccedil: "Ç", Uacute: "Ú",
  aacute: "á", acirc: "â", agrave: "à", atilde: "ã",
  ccedil: "ç", eacute: "é", ecirc: "ê",
  iacute: "í", oacute: "ó", ocirc: "ô", otilde: "õ",
  uacute: "ú", ldquo: "“", rdquo: "”",
  ndash: "–", nbsp: " ", amp: "&",
};

function decodeEntities(input: string): string {
  return input.replace(/&([a-zA-Z]+);/g, (m, name) =>
    HTML_ENTITIES[name] !== undefined ? HTML_ENTITIES[name] : m
  );
}

interface CsvRow {
  "Product Handle": string;
  "Product Title": string;
  "Product Description": string;
  "Product Status": string;
  "Product Thumbnail": string;
  "Product Weight": string;
  "Product Height": string;
  "Product Width": string;
  "Product Length": string;
  "Product Discountable": string;
  "Product Collection Id": string;
  "Product Image 1": string;
  "Product Image 2": string;
  "Product Image 3": string;
  "Product Image 4": string;
  "Variant Title": string;
  "Variant SKU": string;
  "Variant Allow Backorder": string;
  "Variant Manage Inventory": string;
  "Variant Weight": string;
  "Variant Height": string;
  "Variant Width": string;
  "Variant Length": string;
  "Variant Price BRL": string;
  "Variant Option 1 Name": string;
  "Variant Option 1 Value": string;
  "Variant Option 2 Name": string;
  "Variant Option 2 Value": string;
}

export default async function setupTyerStore({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService = container.resolve(Modules.STORE);
  const collectionModuleService = container.resolve(Modules.PRODUCT);

  // ---------- Sales channel ----------
  const [store] = await storeModuleService.listStores();
  let [salesChannel] = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });
  if (!salesChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "Default Sales Channel" }] },
    });
    salesChannel = result[0];
  }
  logger.info(`Sales channel: ${salesChannel.id}`);

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_sales_channel_id: salesChannel.id,
        supported_currencies: [{ currency_code: "brl", is_default: true }],
      },
    },
  });

  // ---------- Regiao Brasil ----------
  const { data: existingRegions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  });
  let region: any = existingRegions.find((r: any) => r.currency_code === "brl");
  if (!region) {
    const { result: regionResult } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Brasil",
            currency_code: "brl",
            countries: ["br"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    });
    region = regionResult[0];
  }
  logger.info(`Regiao Brasil: ${region.id}`);

  await createTaxRegionsWorkflow(container).run({
    input: [{ country_code: "br", provider_id: "tp_system" }],
  }).catch(() => {
    logger.info("Tax region BR ja existe, seguindo.");
  });

  // ---------- Estoque + fulfillment ----------
  const { data: existingLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  });
  let stockLocation: any = existingLocations.find(
    (l: any) => l.name === "Estoque Principal"
  );
  if (!stockLocation) {
    const { result: stockLocationResult } = await createStockLocationsWorkflow(
      container
    ).run({
      input: {
        locations: [
          {
            name: "Estoque Principal",
            address: { city: "Sao Paulo", country_code: "BR", address_1: "" },
          },
        ],
      },
    });
    stockLocation = stockLocationResult[0];

    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: { default_location_id: stockLocation.id },
      },
    });

    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
    });
  }
  logger.info(`Estoque: ${stockLocation.id}`);

  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  let shippingProfile = shippingProfiles[0];
  if (!shippingProfile) {
    const { result: shippingProfileResult } = await createShippingProfilesWorkflow(
      container
    ).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    });
    shippingProfile = shippingProfileResult[0];
  }

  const existingFulfillmentSets = await fulfillmentModuleService.listFulfillmentSets({
    name: "Entrega Brasil",
  });
  let fulfillmentSet = existingFulfillmentSets[0];
  if (!fulfillmentSet) {
    fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
      name: "Entrega Brasil",
      type: "shipping",
      service_zones: [
        {
          name: "Brasil",
          geo_zones: [{ country_code: "br", type: "country" }],
        },
      ],
    });

    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    });

    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Entrega Padrao",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: fulfillmentSet.service_zones[0].id,
          shipping_profile_id: shippingProfile.id,
          type: {
            label: "Padrao",
            description: "Entrega em 5-10 dias uteis.",
            code: "standard",
          },
          prices: [
            { currency_code: "brl", amount: 25 },
            { region_id: region.id, amount: 25 },
          ],
          rules: [
            { attribute: "enabled_in_store", value: "true", operator: "eq" },
            { attribute: "is_return", value: "false", operator: "eq" },
          ],
        },
      ],
    });
  }

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: stockLocation.id, add: [salesChannel.id] },
  }).catch(() => {});

  // ---------- Publishable API key ----------
  const { data: apiKeyData } = await query.graph({
    entity: "api_key",
    fields: ["id", "token"],
    filters: { type: "publishable" },
  });
  let publishableApiKey: any = apiKeyData?.[0];
  if (!publishableApiKey) {
    const {
      result: [created],
    } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [{ title: "Tyer Storefront", type: "publishable", created_by: "" }],
      },
    });
    publishableApiKey = created;
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: publishableApiKey.id, add: [salesChannel.id] },
    });
  }
  logger.info(`Publishable API key: ${publishableApiKey.token}`);

  // ---------- Colecoes ----------
  const collectionIdByCsvId: Record<string, string> = {};
  const wantedCollectionTitles = Array.from(
    new Set(Object.values(COLLECTION_TITLE_BY_CSV_ID))
  );
  const { data: existingCollections } = await query.graph({
    entity: "product_collection",
    fields: ["id", "title"],
  });
  for (const [csvId, title] of Object.entries(COLLECTION_TITLE_BY_CSV_ID)) {
    const found = existingCollections.find((c: any) => c.title === title);
    if (found) {
      collectionIdByCsvId[csvId] = found.id;
      continue;
    }
    const { result } = await createCollectionsWorkflow(container).run({
      input: { collections: [{ title }] },
    });
    collectionIdByCsvId[csvId] = result[0].id;
    logger.info(`Colecao criada: ${title} (${result[0].id})`);
  }
  void wantedCollectionTitles;
  void collectionModuleService;

  // ---------- Parse CSV ----------
  const csvPath = path.join(process.cwd(), "data", "import-medusa.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rows: CsvRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  const rowsByHandle = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const handle = row["Product Handle"]?.trim();
    if (!handle) continue;
    if (!rowsByHandle.has(handle)) rowsByHandle.set(handle, []);
    rowsByHandle.get(handle)!.push(row);
  }

  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
  });
  const existingHandles = new Set(existingProducts.map((p: any) => p.handle));

  const productsToCreate: any[] = [];

  for (const [handle, variantRows] of rowsByHandle) {
    if (existingHandles.has(handle)) {
      logger.info(`Produto ja existe, pulando: ${handle}`);
      continue;
    }
    const head = variantRows[0];

    const images = [1, 2, 3, 4]
      .map((n) => head[`Product Image ${n}` as keyof CsvRow])
      .filter((url) => !!url)
      .map((url) => ({ url: url as string }));

    const optionTitles = new Set<string>();
    const optionValues = new Map<string, Set<string>>();
    for (const row of variantRows) {
      for (const n of [1, 2]) {
        const name = row[`Variant Option ${n} Name` as keyof CsvRow] as string;
        const value = row[`Variant Option ${n} Value` as keyof CsvRow] as string;
        if (!name || !value) continue;
        optionTitles.add(name);
        if (!optionValues.has(name)) optionValues.set(name, new Set());
        optionValues.get(name)!.add(value);
      }
    }
    const options = Array.from(optionTitles).map((title) => ({
      title,
      values: Array.from(optionValues.get(title) || []),
    }));

    const variants = variantRows.map((row) => {
      const variantOptions: Record<string, string> = {};
      for (const n of [1, 2]) {
        const name = row[`Variant Option ${n} Name` as keyof CsvRow] as string;
        const value = row[`Variant Option ${n} Value` as keyof CsvRow] as string;
        if (name && value) variantOptions[name] = value;
      }
      const price = Number(String(row["Variant Price BRL"]).replace(",", "."));
      return {
        title: row["Variant Title"] || handle,
        sku: row["Variant SKU"] || undefined,
        options: variantOptions,
        manage_inventory: true,
        allow_backorder: false,
        weight: Number(row["Variant Weight"]) || undefined,
        height: Number(row["Variant Height"]) || undefined,
        width: Number(row["Variant Width"]) || undefined,
        length: Number(row["Variant Length"]) || undefined,
        prices: [{ amount: price, currency_code: "brl" }],
      };
    });

    const csvCollectionId = head["Product Collection Id"]?.trim();
    const collection_id = csvCollectionId
      ? collectionIdByCsvId[csvCollectionId]
      : undefined;

    productsToCreate.push({
      title: head["Product Title"],
      handle,
      description: head["Product Description"]
        ? decodeEntities(head["Product Description"])
        : undefined,
      status: ProductStatus.PUBLISHED,
      thumbnail: head["Product Thumbnail"] || undefined,
      images: images.length ? images : undefined,
      weight: Number(head["Product Weight"]) || undefined,
      height: Number(head["Product Height"]) || undefined,
      width: Number(head["Product Width"]) || undefined,
      length: Number(head["Product Length"]) || undefined,
      discountable: head["Product Discountable"] !== "FALSE",
      collection_id,
      shipping_profile_id: shippingProfile.id,
      options,
      variants,
      sales_channels: [{ id: salesChannel.id }],
    });
  }

  logger.info(`Criando ${productsToCreate.length} produtos...`);
  const BATCH = 5;
  for (let i = 0; i < productsToCreate.length; i += BATCH) {
    const batch = productsToCreate.slice(i, i + BATCH);
    await createProductsWorkflow(container).run({ input: { products: batch } });
    logger.info(`  ...${Math.min(i + BATCH, productsToCreate.length)}/${productsToCreate.length}`);
  }

  // ---------- Estoque das variantes ----------
  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });
  const { data: existingLevels } = await query.graph({
    entity: "inventory_level",
    fields: ["inventory_item_id"],
    filters: { location_id: stockLocation.id },
  });
  const hasLevel = new Set(existingLevels.map((l: any) => l.inventory_item_id));

  const inventoryLevels: CreateInventoryLevelInput[] = inventoryItems
    .filter((item: any) => !hasLevel.has(item.id))
    .map((item: any) => ({
      location_id: stockLocation.id,
      stocked_quantity: 100,
      inventory_item_id: item.id,
    }));

  if (inventoryLevels.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: inventoryLevels },
    });
  }

  logger.info("========================================");
  logger.info(`Produtos criados: ${productsToCreate.length}`);
  logger.info(`Sales channel: ${salesChannel.id}`);
  logger.info(`Regiao BRL: ${region.id}`);
  logger.info(`Publishable API key: ${publishableApiKey.token}`);
  logger.info("========================================");
}
