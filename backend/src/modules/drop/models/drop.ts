import { model } from "@medusajs/framework/utils"

const Drop = model.define("drop", {
  id: model.id({ prefix: "drop" }).primaryKey(),
  handle: model.text().unique(),
  title: model.text(),
  subtitle: model.text().nullable(),
  is_current: model.boolean().default(false),
  preorder_starts_at: model.dateTime(),
  preorder_ends_at: model.dateTime(),
  general_starts_at: model.dateTime().nullable(),
  general_ends_at: model.dateTime(),
  general_lot: model.number().nullable(),
  sell_until_sold_out: model.boolean().default(false),
  closed_at: model.dateTime().nullable(),
  production_days: model.number().default(21),
  release_leads_in_presale: model.boolean().default(false),
  component_key: model.text().nullable(),
  hero_kind: model.enum(["community_video", "drop_video", "banner"]).default("banner"),
  hero_url: model.text().nullable(),
  cover_url: model.text().nullable(),
  instagram_url: model.text().nullable(),
  whatsapp_url: model.text().nullable(),
})

export default Drop
