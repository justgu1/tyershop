import { model } from "@medusajs/framework/utils"

const EmailView = model.define("email_view", {
  id: model.id({ prefix: "eview" }).primaryKey(),
  notification_id: model.text().unique(),
  first_viewed_at: model.dateTime(),
  last_viewed_at: model.dateTime(),
  view_count: model.number().default(1),
  last_ip: model.text().nullable(),
  last_user_agent: model.text().nullable(),
  country: model.text().nullable(),
  city: model.text().nullable(),
})

export default EmailView
