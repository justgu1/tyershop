import type { DropPhase } from "../drop/phase"
import type { LeadStatus } from "./models/lead"

/**
 * Quem se cadastra enquanto o cronômetro da pré-venda corre já fica liberado e recebe o ingresso quando ela abre.
 * Com a pré-venda já aberta, só entra liberado se o drop tiver `release_leads_in_presale` ligado; sem isso (ou fora dessas fases) o cadastro continua pendente. Quem já foi liberado, inativado ou negado não muda por um novo cadastro; quem se descadastrou também não volta sozinho, porque qualquer pessoa poderia reinscrever o e-mail de outra.
 */
export function statusOnCapture(
  existing: LeadStatus | null | undefined,
  phase: DropPhase | null,
  releaseInPresale = false
): LeadStatus {
  if (existing && existing !== "pendente") return existing
  if (phase === "coming_soon") return "liberado"
  return phase === "presale" && releaseInPresale ? "liberado" : "pendente"
}
