import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { deliverConfirmation } from "../utils/order-confirmation"

const MAX_PER_RUN = 20

/**
 * Reenvia confirmações de pedido que não saíram (SMTP fora do ar, processo reiniciado no meio). Só olha pedidos que já
 * tiveram uma tentativa registrada e não têm o envio gravado, dos últimos dois dias: nada é enviado a pedidos antigos.
 */
export default async function resendConfirmations(container: MedusaContainer) {
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const logger = container.resolve("logger") as any
  const { rows } = await pg.raw(
    `select id from "order"
      where deleted_at is null and created_at >= now() - interval '2 days'
        and jsonb_exists(metadata, 'confirmation_claimed_at')
        and not jsonb_exists(metadata, 'confirmation_sent_at')
        and (metadata->>'confirmation_claimed_at')::timestamptz < now() - interval '10 minutes'
      order by created_at asc
      limit ?`,
    [MAX_PER_RUN]
  )
  for (const { id } of rows as { id: string }[]) {
    await deliverConfirmation(container, id).catch((err) => logger.error(`[confirmação] ${id}: ${err.message}`))
  }
}

export const config = { name: "resend-confirmations", schedule: "*/15 * * * *" }
