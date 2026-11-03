import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

const KEY = "melhor_envio_auto_label"

/** A escolha feita no admin vale; sem escolha, vale a variável de ambiente (desligada por padrão). */
export const resolveAutoLabel = (saved: unknown, env: string | undefined): boolean =>
  typeof saved === "boolean" ? saved : (env ?? "").trim().toLowerCase() === "true"

export async function autoLabelEnabled(scope: MedusaContainer): Promise<boolean> {
  const [store] = await (scope.resolve(Modules.STORE) as any).listStores()
  return resolveAutoLabel(store?.metadata?.[KEY], process.env.MELHOR_ENVIO_AUTO_LABEL)
}

export async function setAutoLabel(scope: MedusaContainer, enabled: boolean): Promise<void> {
  const service = scope.resolve(Modules.STORE) as any
  const [store] = await service.listStores()
  if (!store) throw new Error("Loja não encontrada.")
  await service.updateStores(store.id, { metadata: { ...(store.metadata ?? {}), [KEY]: enabled } })
}
