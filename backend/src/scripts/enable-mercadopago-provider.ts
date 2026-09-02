/**
 * Liga o payment provider "mercadopago" (pp_mercadopago_mercadopago) na(s)
 * região(ões) da loja — sem isso o Medusa nunca oferece o provider no
 * checkout, mesmo com o módulo carregado.
 *
 * Rodar: docker compose exec backend npx medusa exec ./src/scripts/enable-mercadopago-provider.ts
 */
import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";

export default async function enableMercadoPagoProvider({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const regionModuleService = container.resolve(Modules.REGION);
  const paymentModuleService = container.resolve(Modules.PAYMENT);

  const providers = await paymentModuleService.listPaymentProviders({ id: ["pp_mercadopago_mercadopago"] });
  if (!providers.length) {
    logger.error(
      "Provider pp_mercadopago_mercadopago não encontrado — confirme o registro em medusa-config.js e reinicie o backend."
    );
    return;
  }

  const regions = await regionModuleService.listRegions({});
  if (!regions.length) {
    logger.warn("Nenhuma região cadastrada ainda.");
    return;
  }

  for (const region of regions) {
    const current = (region.payment_providers ?? []).map((p: any) => p.id);
    if (current.includes("pp_mercadopago_mercadopago")) {
      logger.info(`Região "${region.name}" já tem o mercadopago habilitado.`);
      continue;
    }
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: { payment_providers: [...current, "pp_mercadopago_mercadopago"] },
      },
    });
    logger.info(`Mercado Pago habilitado na região "${region.name}".`);
  }
}
