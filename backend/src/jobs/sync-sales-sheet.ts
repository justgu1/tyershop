import { MedusaContainer } from "@medusajs/framework/types"
import { syncWithLock } from "../modules/sales-sheet/sync"

/** Rede de segurança dos eventos: reembolso feito fora do Medusa ou evento perdido entra na planilha em até 10 minutos. */
export default async function syncSalesSheetJob(container: MedusaContainer) {
  if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) return
  await syncWithLock(container).catch((err) => container.resolve("logger").error(`[sales-sheet] ${err.message}`))
}

export const config = { name: "sync-sales-sheet", schedule: "*/10 * * * *" }
