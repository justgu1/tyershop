import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { DROP_MODULE } from "../modules/drop"
import DropModuleService from "../modules/drop/service"
import { resolveDropPhase } from "../modules/drop/phase"
import { issueTickets } from "../modules/ticket/issue"

/**
 * Com a pré-venda aberta, todo liberado sem ingresso recebe o e-mail que o autentica.
 * Idempotente: quem já recebeu não recebe de novo. O lock impede duas execuções ao mesmo tempo
 * (duas réplicas, ou uma rodada lenta ainda enviando quando a próxima começa).
 */
export default async function issuePresaleTickets(container: MedusaContainer) {
  const current = await container.resolve<DropModuleService>(DROP_MODULE).retrieveCurrent()
  if (!current || resolveDropPhase(current) !== "presale") return

  const locking = container.resolve(Modules.LOCKING) as any
  await locking.execute(
    `issue-presale-tickets:${current.id}`,
    async () => {
      const { created, sent, failed } = await issueTickets(container, current.id)
      if (created || sent || failed.length) {
        container.resolve("logger").info(`pré-venda ${current.handle}: ${created} ingressos, ${sent} e-mails, ${failed.length} falhas`)
      }
    },
    { timeout: 1 }
  ).catch((err: Error) => {
    // Outra execução já está no lock: normal, não é erro.
    if (!/timed out|acquire/i.test(err.message)) throw err
  })
}

export const config = { name: "issue-presale-tickets", schedule: "* * * * *" }
