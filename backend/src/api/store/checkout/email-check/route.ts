import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { checkEmail } from "../../../../utils/email"

/** Confere o e-mail do checkout antes de criar conta e pedido (o formulário só vê o formato). */
export async function POST(req: MedusaRequest<{ email?: string }>, res: MedusaResponse) {
  const problem = await checkEmail(String(req.body?.email ?? ""))
  return res.json({ ok: !problem, message: problem })
}
