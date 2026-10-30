import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { redeemTicket } from "../../../../modules/ticket/redeem"
import { RedeemTicketBody } from "./validators"

export async function POST(req: MedusaRequest<RedeemTicketBody>, res: MedusaResponse) {
  res.json(await redeemTicket(req.scope, req.validatedBody.code))
}
