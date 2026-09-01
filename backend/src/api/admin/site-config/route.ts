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

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const storeModuleService = req.scope.resolve(Modules.STORE) as any;
  const [store] = await storeModuleService.listStores();
  const config = { ...DEFAULT_CONFIG, ...(store?.metadata?.site_config as object | undefined) };
  res.json({ site_config: config });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const storeModuleService = req.scope.resolve(Modules.STORE) as any;
  const [store] = await storeModuleService.listStores();
  if (!store) return res.status(404).json({ message: "Store not found" });

  const body = (req.body || {}) as Record<string, unknown>;
  const nextConfig = {
    popup: { ...DEFAULT_CONFIG.popup, ...(store.metadata?.site_config as any)?.popup, ...(body.popup as object) },
    countdown: {
      ...DEFAULT_CONFIG.countdown,
      ...(store.metadata?.site_config as any)?.countdown,
      ...(body.countdown as object),
    },
  };

  await storeModuleService.updateStores(store.id, {
    metadata: { ...(store.metadata || {}), site_config: nextConfig },
  });

  res.json({ site_config: nextConfig });
}
