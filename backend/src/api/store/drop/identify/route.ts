import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { IdentifyBody } from "./validators"

/**
 * Primeiro passo do formulário de acesso: diz se o e-mail já tem login (pede a senha) ou não (a página registra o
 * lead e manda o acesso por e-mail). Não cria nada: só consulta.
 */
export async function POST(req: MedusaRequest<IdentifyBody>, res: MedusaResponse) {
  const { email } = req.validatedBody
  const auth = req.scope.resolve(Modules.AUTH) as any
  const [identity] = await auth.listAuthIdentities(
    { provider_identities: { entity_id: email, provider: "emailpass" } },
    { take: 1 }
  )
  res.json({ exists: !!identity })
}
