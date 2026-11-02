import { model } from "@medusajs/framework/utils"

/** Token OAuth do aplicativo no Melhor Envio. Sempre há no máximo uma linha. */
const MelhorEnvioToken = model.define("melhor_envio_token", {
  id: model.id({ prefix: "metok" }).primaryKey(),
  access_token: model.text(),
  refresh_token: model.text(),
  expires_at: model.dateTime(),
})

export default MelhorEnvioToken
