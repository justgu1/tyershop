import { MedusaService } from "@medusajs/framework/utils"
import AccessLink from "./models/access-link"
import Ticket from "./models/ticket"

class TicketModuleService extends MedusaService({ Ticket, AccessLink }) {}

export default TicketModuleService
