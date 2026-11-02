import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/** Quais pedidos da conta têm nota fiscal anexada: a página só precisa disso, sem receber o estado interno do pedido. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Entre na sua conta.")
  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const { rows } = await pg.raw(
    `select id from "order" where customer_id = ? and deleted_at is null and jsonb_exists(coalesce(metadata, '{}'::jsonb), 'invoice')`,
    [customerId]
  )
  res.json({ order_ids: rows.map((r: { id: string }) => r.id) })
}
