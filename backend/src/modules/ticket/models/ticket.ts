import { model } from "@medusajs/framework/utils"

const Ticket = model
  .define("ticket", {
    id: model.id({ prefix: "tkt" }).primaryKey(),
    drop_id: model.text(),
    lead_id: model.text(),
    customer_id: model.text().nullable(),
    code: model.text().unique(),
    source: model.enum(["liberado", "link", "manual"]).default("liberado"),
    access_link_id: model.text().nullable(),
    sent_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["drop_id", "lead_id"], unique: true }])

export default Ticket
