import { MedusaContainer } from "@medusajs/framework/types"
import { syncShipments } from "../modules/melhor-envio/purchase"

/**
 * A cada meia hora confere as etiquetas compradas (pela compra automática ou pelo botão do admin): postagem e entrega viram
 * envio e e-mail no pedido. Sem etiquetas em aberto não faz nenhuma chamada ao Melhor Envio.
 */
export default async function syncMelhorEnvio(container: MedusaContainer) {
  await syncShipments(container)
}

export const config = { name: "sync-melhor-envio", schedule: "*/30 * * * *" }
