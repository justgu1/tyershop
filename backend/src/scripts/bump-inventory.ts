import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateInventoryLevelsWorkflow } from "@medusajs/medusa/core-flows";

// Ambiente de teste: sobe o estoque geral pra nao travar o replay historico de
// vendas (mais unidades vendidas no historico do que os 100 que seedamos).
export default async function bumpInventory({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  });
  const location = locations.find((l: any) => l.name === "Estoque Principal") || locations[0];
  if (!location) throw new Error("Sem stock location.");

  const { data: levels } = await query.graph({
    entity: "inventory_level",
    fields: ["id", "inventory_item_id", "location_id", "stocked_quantity"],
    filters: { location_id: location.id },
  });

  const updates = levels.map((l: any) => ({
    inventory_item_id: l.inventory_item_id,
    location_id: location.id,
    stocked_quantity: 5000,
  }));

  await updateInventoryLevelsWorkflow(container).run({ input: { updates } });
  logger.info(`Estoque de ${updates.length} variantes elevado pra 5000 unidades.`);
}
