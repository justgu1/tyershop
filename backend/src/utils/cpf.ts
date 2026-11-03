/** CPF com 11 dígitos e dígitos verificadores corretos (o Melhor Envio recusa o resto). */
export function isValidCpf(value: unknown): boolean {
  const c = String(value ?? "").replace(/\D/g, "")
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  for (const n of [9, 10]) {
    let sum = 0
    for (let i = 0; i < n; i++) sum += Number(c[i]) * (n + 1 - i)
    if (((sum * 10) % 11) % 10 !== Number(c[n])) return false
  }
  return true
}
