import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DROP_MODULE } from "../../../modules/drop"
import DropModuleService from "../../../modules/drop/service"
import { presentDrop } from "../../../modules/drop/present"
import { CreateDropBody } from "./validators"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const drops = req.scope.resolve<DropModuleService>(DROP_MODULE)
  const list = await drops.listDrops({}, { order: { preorder_starts_at: "DESC" } })
  res.json({ drops: list.map((d) => presentDrop(d)) })
}

export async function POST(req: MedusaRequest<CreateDropBody>, res: MedusaResponse) {
  const drops = req.scope.resolve<DropModuleService>(DROP_MODULE)
  const { is_current, ...data } = req.validatedBody

  const created = await drops.createDrops({ ...data, is_current: false } as any)
  if (is_current) await drops.makeCurrent(created.id)

  const fresh = await drops.retrieveDrop(created.id)
  res.status(201).json({ drop: presentDrop(fresh) })
}
