import { createSign } from "node:crypto"

const SCOPE = "https://www.googleapis.com/auth/spreadsheets"
const API = "https://sheets.googleapis.com/v4/spreadsheets"

export type ServiceAccount = { client_email: string; private_key: string }

const b64 = (v: object | Buffer) => Buffer.from(v instanceof Buffer ? v : JSON.stringify(v)).toString("base64url")

/** Aceita o JSON da conta de serviço puro ou em base64 (mais fácil de guardar em Secret). */
export function parseServiceAccount(raw: string): ServiceAccount {
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")
  const parsed = JSON.parse(text)
  if (!parsed.client_email || !parsed.private_key) throw new Error("conta de serviço sem client_email ou private_key")
  return parsed
}

export function signJwt(sa: ServiceAccount, now = Math.floor(Date.now() / 1000)): string {
  const head = b64({ alg: "RS256", typ: "JWT" })
  const claims = b64({ iss: sa.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })
  const sig = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(sa.private_key)
  return `${head}.${claims}.${b64(sig)}`
}

export class SheetsClient {
  private token: { value: string; expiresAt: number } | null = null

  constructor(private sa: ServiceAccount, private spreadsheetId: string) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signJwt(this.sa) }),
    })
    const body: any = await res.json().catch(() => ({}))
    if (!res.ok || !body.access_token) throw new Error(`Google recusou a conta de serviço (${res.status}): ${body.error_description ?? body.error ?? "sem detalhe"}`)
    this.token = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 }
    return this.token.value
  }

  private async call(path: string, init: RequestInit = {}): Promise<any> {
    const res = await fetch(`${API}/${this.spreadsheetId}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await this.accessToken()}`, "content-type": "application/json" },
    })
    const body: any = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${body.error?.message ?? "sem detalhe"}`)
    return body
  }

  async getLocale(): Promise<string> {
    return (await this.call("?fields=properties(locale)")).properties?.locale ?? "en_US"
  }

  getSheets(): Promise<{ sheets: { properties: { sheetId: number; title: string }; charts?: { chartId: number }[] }[] }> {
    return this.call("?fields=sheets(properties(sheetId,title),charts(chartId))")
  }

  batchUpdate(requests: object[]): Promise<any> {
    return this.call(":batchUpdate", { method: "POST", body: JSON.stringify({ requests }) })
  }

  clear(range: string) {
    return this.call(`/values/${encodeURIComponent(range)}:clear`, { method: "POST", body: "{}" })
  }

  write(range: string, values: (string | number)[][]) {
    return this.call(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, { method: "PUT", body: JSON.stringify({ range, values }) })
  }
}
