import { Module } from "@medusajs/framework/utils"
import DropModuleService from "./service"

export const DROP_MODULE = "drop"

export default Module(DROP_MODULE, { service: DropModuleService })
