import type { DropPhase } from "../drop/phase"
import type { LeadStatus } from "./models/lead"

/**
 * Quem se cadastra enquanto o cronômetro da pré-venda corre já fica liberado e recebe o ingresso quando ela abre.
 * Fora dessa fase o cadastro continua pendente. Quem já foi liberado, inativado ou negado não muda por um novo cadastro; quem se descadastrou também não volta sozinho, porque qualquer pessoa poderia reinscrever o e-mail de outra.
 */
export function statusOnCapture(existing: LeadStatus | null | undefined, phase: DropPhase | null): LeadStatus {
  if (existing && existing !== "pendente") return existing
  return phase === "coming_soon" ? "liberado" : "pendente"
}
