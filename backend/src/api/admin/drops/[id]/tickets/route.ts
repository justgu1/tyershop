import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { issueTickets, previewTickets } from "../../../../../modules/ticket/issue"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json(await previewTickets(req.scope, req.params.id))
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.json(await issueTickets(req.scope, req.params.id))
}
