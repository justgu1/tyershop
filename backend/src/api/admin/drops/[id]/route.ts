import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { DROP_MODULE } from "../../../../modules/drop"
import DropModuleService from "../../../../modules/drop/service"
import { presentDrop } from "../../../../modules/drop/present"
import { UpdateDropBody } from "../validators"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const drops = req.scope.resolve<DropModuleService>(DROP_MODULE)
  const drop = await drops.retrieveDrop(req.params.id)
  res.json({ drop: presentDrop(drop) })
}

export async function POST(req: MedusaRequest<UpdateDropBody>, res: MedusaResponse) {
  const drops = req.scope.resolve<DropModuleService>(DROP_MODULE)
  const { is_current, ...data } = req.validatedBody

  if (Object.keys(data).length) await drops.updateDrops({ id: req.params.id, ...data })
  if (is_current === true) await drops.makeCurrent(req.params.id)
  if (is_current === false) await drops.updateDrops({ id: req.params.id, is_current: false })

  const drop = await drops.retrieveDrop(req.params.id)
  res.json({ drop: presentDrop(drop) })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const drops = req.scope.resolve<DropModuleService>(DROP_MODULE)
  await drops.deleteDrops(req.params.id)
  res.json({ id: req.params.id, deleted: true })
}
