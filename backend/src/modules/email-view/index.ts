import { Module } from "@medusajs/framework/utils"
import EmailViewModuleService from "./service"

export const EMAIL_VIEW_MODULE = "emailView"

export default Module(EMAIL_VIEW_MODULE, { service: EmailViewModuleService })
