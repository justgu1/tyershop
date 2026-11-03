import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { reconcilePayments } from "../modules/payment-mercadopago/reconcile"

/** A cada 5 minutos confere o banco com o Mercado Pago (pedido que faltou, pagamento sem captura). O lock evita duas rodadas juntas. */
export default async function reconcilePaymentsJob(container: MedusaContainer) {
  const locking = container.resolve(Modules.LOCKING) as any
  await locking
    .execute("reconcile-payments", async () => {
      const { completed, captured, errors } = await reconcilePayments(container)
      if (completed.length || captured.length || errors.length) {
        container.resolve("logger").info(`conciliação: ${completed.length} pedido(s) criado(s), ${captured.length} captura(s), ${errors.length} erro(s) ${errors.slice(0, 3).join(" | ")}`)
      }
    }, { timeout: 1 })
    .catch((err: Error) => {
      if (!/timed out|acquire/i.test(err.message)) throw err
    })
}

export const config = { name: "reconcile-payments", schedule: "*/5 * * * *" }
