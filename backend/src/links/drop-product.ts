import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import DropModule from "../modules/drop"

export default defineLink(DropModule.linkable.drop, { linkable: ProductModule.linkable.product, isList: true })
