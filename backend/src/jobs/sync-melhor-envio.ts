import { MedusaContainer } from "@medusajs/framework/types"
import { autoLabelEnabled, syncShipments } from "../modules/melhor-envio/purchase"

/** A cada meia hora confere as etiquetas compradas: postagem e entrega viram envio e e-mail no pedido. */
export default async function syncMelhorEnvio(container: MedusaContainer) {
  if (!autoLabelEnabled()) return
  await syncShipments(container)
}

export const config = { name: "sync-melhor-envio", schedule: "*/30 * * * *" }
