import { model } from "@medusajs/framework/utils"

const EmailBounce = model.define("email_bounce", {
  id: model.id({ prefix: "ebounce" }).primaryKey(),
  notification_id: model.text().unique(),
  message_id: model.text(),
  recipient: model.text().nullable(),
  status_code: model.text().nullable(),
  reason: model.text(),
  diagnostic: model.text().nullable(),
  bounced_at: model.dateTime(),
})

export default EmailBounce
