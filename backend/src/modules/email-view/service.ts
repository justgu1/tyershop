import { MedusaService } from "@medusajs/framework/utils"
import EmailView from "./models/email-view"
import EmailBounce from "./models/email-bounce"

class EmailViewModuleService extends MedusaService({ EmailView, EmailBounce }) {}

export default EmailViewModuleService
