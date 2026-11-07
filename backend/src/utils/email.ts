import { promises as dns } from "node:dns"

// Provedores onde um erro de digitação é quase certo; o domínio certo vai na mensagem.
const KNOWN_DOMAINS = [
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "icloud.com", "uol.com.br", "bol.com.br",
  "terra.com.br", "live.com", "msn.com", "protonmail.com",
]

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}

export function emailDomain(email: string): string {
  return String(email ?? "").trim().toLowerCase().split("@")[1] ?? ""
}

/** Domínio conhecido escrito errado (gamail.com, gmial.com, gmail.con): devolve o domínio certo, ou null. */
export function suggestDomain(domain: string): string | null {
  const d = domain.toLowerCase()
  if (!d || KNOWN_DOMAINS.includes(d)) return null
  return KNOWN_DOMAINS.find((known) => editDistance(d, known) <= (known.length > 9 ? 2 : 1)) ?? null
}

/** Mensagem de erro para o cliente, ou null quando o formato é aceitável. Não consulta a rede. */
export function emailProblem(email: string): string | null {
  const value = String(email ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(value) || value.includes("..")) return "Digite um e-mail válido."
  const suggestion = suggestDomain(emailDomain(value))
  return suggestion ? `O domínio do e-mail parece errado. Você quis dizer @${suggestion}?` : null
}

/** O domínio recebe e-mail? Falha de rede não bloqueia ninguém; só a resposta "domínio não existe" ou "sem servidor". */
export async function domainAcceptsMail(domain: string): Promise<boolean> {
  if (domain.endsWith(".invalid")) return true
  try {
    const mx = await dns.resolveMx(domain)
    if (mx.some((r) => r.exchange && r.exchange !== ".")) return true
    return false
  } catch (err: any) {
    if (err?.code === "ENODATA") {
      try {
        return (await dns.resolve4(domain)).length > 0
      } catch (e: any) {
        return !["ENOTFOUND", "ENODATA"].includes(e?.code)
      }
    }
    return err?.code !== "ENOTFOUND"
  }
}

/** Formato, erro de digitação e domínio sem servidor de e-mail. */
export async function checkEmail(email: string): Promise<string | null> {
  const problem = emailProblem(email)
  if (problem) return problem
  return (await domainAcceptsMail(emailDomain(email))) ? null : "Esse domínio de e-mail não existe. Confira o endereço."
}
