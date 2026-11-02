import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MELHOR_ENVIO_MODULE } from "../../../../modules/melhor-envio"
import MelhorEnvioModuleService from "../../../../modules/melhor-envio/service"
import { verifyState } from "../../../../modules/melhor-envio/state"

/**
 * Fim do OAuth do Melhor Envio. A página de retorno do site manda o código e o `state`;
 * só vale autorização iniciada pelo admin (state assinado e com validade).
 */
export async function POST(req: MedusaRequest<{ code?: string; state?: string }>, res: MedusaResponse) {
  const { code, state } = req.body ?? {}
  if (!code || !verifyState(state)) {
    return res.status(400).json({ message: "Link inválido ou expirado. Inicie a conexão pelo painel de administração." })
  }
  try {
    await req.scope.resolve<MelhorEnvioModuleService>(MELHOR_ENVIO_MODULE).connect(code)
  } catch {
    return res.status(502).json({ message: "O Melhor Envio recusou a autorização. Tente de novo pelo painel." })
  }
  res.json({ ok: true })
}
