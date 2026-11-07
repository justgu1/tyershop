// Mesma regra de backend/src/utils/email.ts (o servidor repete a checagem).
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
