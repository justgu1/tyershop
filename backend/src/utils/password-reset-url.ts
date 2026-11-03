const trimSlash = (url: string) => url.replace(/\/$/, "")

/** Link do e-mail de redefinição: loja para cliente, admin do Medusa para usuário do admin. */
export function passwordResetUrl(
  actorType: string,
  token: string,
  email: string,
  env: Record<string, string | undefined>
): string | null {
  if (actorType === "customer") {
    return `${trimSlash(env.SITE_URL || "http://localhost:4321")}/account/reset-password?token=${encodeURIComponent(token)}`
  }
  if (actorType === "user") {
    const admin = trimSlash(env.ADMIN_CORS?.split(",")[0]?.trim() || "http://localhost:9000")
    return `${admin}/app/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
  }
  return null
}
