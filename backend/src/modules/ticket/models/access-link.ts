import { model } from "@medusajs/framework/utils"

const AccessLink = model.define("access_link", {
  id: model.id({ prefix: "alink" }).primaryKey(),
  drop_id: model.text(),
  slug: model.text().unique(),
  slots: model.number().nullable(),
  used: model.number().default(0),
})

export default AccessLink
