import { MedusaContainer } from "@medusajs/framework/types"
import { autoLabelEnabled, resumeStuckPurchases, syncShipments } from "../modules/melhor-envio/purchase"

/**
 * A cada meia hora confere as etiquetas compradas (pela compra automática ou pelo botão do admin): postagem e entrega viram
 * envio e e-mail no pedido. Sem etiquetas em aberto custa uma consulta ao banco e nenhuma chamada ao Melhor Envio.
 * As duas tarefas são independentes: a falha de uma não impede a outra.
 */
export default async function syncMelhorEnvio(container: MedusaContainer) {
  const logger = container.resolve("logger") as any
  await syncShipments(container).catch((err) => logger.error(`[melhor-envio] acompanhamento: ${err.message}`))
  if (await autoLabelEnabled(container)) await resumeStuckPurchases(container).catch((err) => logger.error(`[melhor-envio] retomada: ${err.message}`))
}

export const config = { name: "sync-melhor-envio", schedule: "*/30 * * * *" }
