export const signingSecret = () => {
  const value = process.env.JWT_SECRET
  if (value) return value
  // Sem segredo em produção qualquer um calcularia o token: recusa em vez de usar o valor padrão conhecido.
  if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET não está definido")
  return "supersecret"
}

export const siteUrl = () => (process.env.SITE_URL || "http://localhost:4321").replace(/\/$/, "")
