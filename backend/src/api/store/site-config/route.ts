import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

const DEFAULT_CONFIG = {
  popup: {
    enabled: true,
    kicker: "Em breve",
    title: "Próximo Drop chegando",
    text: "Cadastre seu e-mail e garanta um desconto exclusivo assim que o próximo drop for ao ar.",
    cta: "Quero meu desconto",
  },
  countdown: {
    enabled: false,
    label: "Próximo Drop em",
    targetIso: "",
    presaveEnabled: false,
    presaveCta: "Pre-save o drop",
  },
};

/** Leitura publica (sem auth) — usada pelo storefront pro popup e pro countdown do hero. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const storeModuleService = req.scope.resolve(Modules.STORE) as any;
  const [store] = await storeModuleService.listStores();
  const config = { ...DEFAULT_CONFIG, ...(store?.metadata?.site_config as object | undefined) };
  res.json({ site_config: config });
}
