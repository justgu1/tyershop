import { Module } from "@medusajs/framework/utils"
import MelhorEnvioModuleService from "./service"

export const MELHOR_ENVIO_MODULE = "melhorEnvio"

export default Module(MELHOR_ENVIO_MODULE, { service: MelhorEnvioModuleService })
