import { MedusaService } from "@medusajs/framework/utils"
import MelhorEnvioToken from "./models/token"
import { exchangeCode, refreshToken, type TokenResponse } from "./client"

const REFRESH_MARGIN_MS = 24 * 3600 * 1000

class MelhorEnvioModuleService extends MedusaService({ MelhorEnvioToken }) {
  private async save(t: TokenResponse) {
    const [current] = await this.listMelhorEnvioTokens({}, { take: 1 })
    const data = {
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(Date.now() + t.expires_in * 1000),
    }
    if (current) await this.updateMelhorEnvioTokens({ id: current.id, ...data })
    else await this.createMelhorEnvioTokens(data)
  }

  async connect(code: string) {
    await this.save(await exchangeCode(code))
  }

  async status() {
    const [current] = await this.listMelhorEnvioTokens({}, { take: 1 })
    return { connected: !!current, expires_at: current?.expires_at ?? null }
  }

  /** Token válido; renova sozinho quando falta menos de um dia para vencer. Null se nunca foi autorizado. */
  async accessToken(): Promise<string | null> {
    const [current] = await this.listMelhorEnvioTokens({}, { take: 1 })
    if (!current) return null
    if (new Date(current.expires_at).getTime() - Date.now() > REFRESH_MARGIN_MS) return current.access_token
    try {
      const next = await refreshToken(current.refresh_token)
      await this.save(next)
      return next.access_token
    } catch {
      return new Date(current.expires_at).getTime() > Date.now() ? current.access_token : null
    }
  }
}

export default MelhorEnvioModuleService
