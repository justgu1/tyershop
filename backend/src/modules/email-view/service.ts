import { MedusaService } from "@medusajs/framework/utils"
import EmailView from "./models/email-view"

class EmailViewModuleService extends MedusaService({ EmailView }) {}

export default EmailViewModuleService
