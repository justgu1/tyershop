import { MedusaContainer } from "@medusajs/framework/types"
import { autoLabelEnabled, resumeStuckPurchases, syncShipments } from "../modules/melhor-envio/purchase"

/**
 * A cada meia hora confere as etiquetas compradas (pela compra automática ou pelo botão do admin): postagem e entrega viram
 * envio e e-mail no pedido. Sem etiquetas em aberto custa uma consulta ao banco e nenhuma chamada ao Melhor Envio.
 */
export default async function syncMelhorEnvio(container: MedusaContainer) {
  await syncShipments(container)
  if (autoLabelEnabled()) await resumeStuckPurchases(container)
}

export const config = { name: "sync-melhor-envio", schedule: "*/30 * * * *" }
