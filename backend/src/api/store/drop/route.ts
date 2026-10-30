import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { DROP_MODULE } from "../../../modules/drop"
import DropModuleService from "../../../modules/drop/service"
import { presentDrop } from "../../../modules/drop/present"
import { getDropProductIds } from "../../../modules/drop/products"
import { hasTicket } from "../../../modules/ticket/access"

const PUBLIC_FIELDS = [
  "id",
  "handle",
  "title",
  "subtitle",
  "phase",
  "next_phase_at",
  "preorder_starts_at",
  "preorder_ends_at",
  "general_starts_at",
  "general_ends_at",
  "production_days",
  "component_key",
  "hero_kind",
  "hero_url",
  "cover_url",
  "instagram_url",
  "whatsapp_url",
] as const

const pick = (d: ReturnType<typeof presentDrop>) =>
  Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, (d as Record<string, unknown>)[k] ?? null]))

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const drops = req.scope.resolve<DropModuleService>(DROP_MODULE)

  const current = await drops.retrieveCurrent()
  const all = await drops.listDrops({}, { order: { preorder_starts_at: "DESC" } })
  const previous = all
    .filter((d) => d.id !== current?.id)
    .map((d) => presentDrop(d))
    .filter((d) => d.phase === "ended")

  let access: "granted" | "locked" | "login" | "none" = "none"
  let productIds: string[] = []

  if (current) {
    const { phase } = presentDrop(current)
    const customerId = req.auth_context?.actor_id

    if (phase === "general") {
      access = "granted"
    } else if (phase === "presale") {
      if (!customerId) {
        access = "login"
      } else {
        const customer = await (req.scope.resolve(Modules.CUSTOMER) as any).retrieveCustomer(customerId)
        access = (await hasTicket(req.scope, current.id, customer.email)) ? "granted" : "locked"
      }
    }
    // Sem direito de acesso a lista de produtos nem sai do servidor.
    if (access === "granted") productIds = await getDropProductIds(req.scope, current.id)
  }

  res.json({
    drop: current ? pick(presentDrop(current)) : null,
    previous: previous.map(pick),
    access,
    product_ids: productIds,
  })
}
