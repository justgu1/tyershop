import { MedusaService } from "@medusajs/framework/utils"
import Lead from "./models/lead"

class LeadModuleService extends MedusaService({ Lead }) {}

export default LeadModuleService
