import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DROP_MODULE } from "../../../modules/drop"
import DropModuleService from "../../../modules/drop/service"
import { presentDrop } from "../../../modules/drop/present"

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

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const drops = req.scope.resolve<DropModuleService>(DROP_MODULE)

  const current = await drops.retrieveCurrent()
  const all = await drops.listDrops({}, { order: { preorder_starts_at: "DESC" } })
  const previous = all
    .filter((d) => d.id !== current?.id)
    .map((d) => presentDrop(d))
    .filter((d) => d.phase === "ended")

  res.json({
    drop: current ? pick(presentDrop(current)) : null,
    previous: previous.map(pick),
  })
}
