import { Module } from "@medusajs/framework/utils"
import LeadModuleService from "./service"

export const LEAD_MODULE = "lead"

export default Module(LEAD_MODULE, { service: LeadModuleService })
