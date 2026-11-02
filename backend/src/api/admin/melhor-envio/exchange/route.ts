import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MELHOR_ENVIO_MODULE } from "../../../../modules/melhor-envio"
import MelhorEnvioModuleService from "../../../../modules/melhor-envio/service"

/** Troca manual do código de autorização (quando a URL de retorno cadastrada não é a deste ambiente). */
export async function POST(req: MedusaRequest<{ code?: string }>, res: MedusaResponse) {
  const code = String(req.body?.code ?? "").trim()
  if (!code) return res.status(400).json({ message: "code é obrigatório." })
  try {
    await req.scope.resolve<MelhorEnvioModuleService>(MELHOR_ENVIO_MODULE).connect(code)
  } catch (err) {
    return res.status(400).json({ message: `${(err as Error).message}. O código vale uma vez só e expira em poucos minutos: gere outro pelo painel.` })
  }
  res.json({ ok: true })
}
