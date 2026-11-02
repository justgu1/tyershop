import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MELHOR_ENVIO_MODULE } from "../../../modules/melhor-envio"
import MelhorEnvioModuleService from "../../../modules/melhor-envio/service"
import { authorizeUrl, baseUrl, oauthConfig } from "../../../modules/melhor-envio/client"
import { signState } from "../../../modules/melhor-envio/state"

/** Estado da conexão com o Melhor Envio e o link para autorizar o aplicativo. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = await req.scope.resolve<MelhorEnvioModuleService>(MELHOR_ENVIO_MODULE).status()
  const { clientId, clientSecret, redirectUri } = oauthConfig()
  const configured = !!(clientId && clientSecret && redirectUri)
  res.json({
    ...status,
    configured,
    environment: baseUrl().includes("sandbox") ? "sandbox" : "production",
    authorize_url: configured ? authorizeUrl(signState()) : null,
  })
}
