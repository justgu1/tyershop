import { MedusaService } from "@medusajs/framework/utils"
import Drop from "./models/drop"

class DropModuleService extends MedusaService({ Drop }) {
  /** Só um drop pode ser o atual; promover um rebaixa os demais. */
  async makeCurrent(id: string) {
    const current = await this.listDrops({ is_current: true })
    const others = current.filter((d) => d.id !== id)
    if (others.length) {
      await this.updateDrops(others.map((d) => ({ id: d.id, is_current: false })))
    }
    return this.updateDrops({ id, is_current: true })
  }

  async retrieveCurrent() {
    const [current] = await this.listDrops({ is_current: true }, { take: 1 })
    return current ?? null
  }
}

export default DropModuleService
