import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DROP_MODULE } from "../../../modules/drop"
import DropModuleService from "../../../modules/drop/service"
import { presentDrop } from "../../../modules/drop/present"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getDropProductIds } from "../../../modules/drop/products"
import { buildSections, DropSection } from "../../../modules/drop/sections"
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

async function sectionsOf(req: AuthenticatedMedusaRequest, productIds: string[]) {
  if (!productIds.length) return []
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "collection.id", "collection.handle", "collection.title", "collection.metadata"],
    filters: { id: productIds },
  })
  const byId = new Map((data as any[]).map((p) => [p.id, p]))
  return buildSections(productIds.map((id) => byId.get(id) ?? { id }))
}

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const drops = req.scope.resolve<DropModuleService>(DROP_MODULE)

  const all = await drops.listDrops({}, { order: { preorder_starts_at: "DESC" } })
  // Sem drop marcado como atual, vale o mais recente: a página nunca fica vazia havendo drops.
  const current = (await drops.retrieveCurrent()) ?? all[0] ?? null
  const previous = all
    .filter((d) => d.id !== current?.id)
    .map((d) => presentDrop(d))
    .filter((d) => d.phase === "ended")

  let access: "granted" | "locked" | "login" | "none" = "none"
  let productIds: string[] = []
  let sections: DropSection[] = []

  if (current) {
    const { phase } = presentDrop(current)
    const customerId = req.auth_context?.actor_id

    if (phase === "general") {
      access = "granted"
    } else if (phase === "presale") {
      if (!customerId) {
        access = "login"
      } else {
        access = (await hasTicket(req.scope, current.id, customerId)) ? "granted" : "locked"
      }
    }
    // Sem direito de acesso a lista de produtos nem sai do servidor.
    if (access === "granted") {
      productIds = await getDropProductIds(req.scope, current.id)
      sections = await sectionsOf(req, productIds)
    }
  }

  res.json({
    drop: current ? pick(presentDrop(current)) : null,
    previous: previous.map(pick),
    access,
    product_ids: productIds,
    sections,
  })
}
