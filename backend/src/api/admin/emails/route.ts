import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { EMAIL_VIEW_MODULE } from "../../../modules/email-view"
import EmailViewModuleService from "../../../modules/email-view/service"
import { BounceReason, REASON_LABEL } from "../../../modules/email-view/bounce"

/** E-mails enviados, com a situação de cada um: devolvido (e por quê), visto (quando e de onde) ou ainda não visto. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { q, template } = req.query as { q?: string; template?: string }
  const filters: Record<string, unknown> = { channel: "email" }
  if (q) filters.to = { $ilike: `%${q}%` }
  if (template) filters.template = template

  const notifications = req.scope.resolve(Modules.NOTIFICATION)
  const [list, count] = await notifications.listAndCountNotifications(filters, {
    order: { created_at: "DESC" },
    take: Math.min(Number(req.query.limit) || 100, 500),
    skip: Number(req.query.offset) || 0,
  })

  const views = req.scope.resolve<EmailViewModuleService>(EMAIL_VIEW_MODULE)
  const seen = list.length ? await views.listEmailViews({ notification_id: list.map((n) => n.id) }) : []
  const byNotification = new Map(seen.map((v) => [v.notification_id, v]))
  const bounces = list.length ? await views.listEmailBounces({ notification_id: list.map((n) => n.id) }) : []
  const bounceOf = new Map(bounces.map((b) => [b.notification_id, b]))

  res.json({
    count,
    emails: list.map((n) => {
      const v = byNotification.get(n.id)
      return {
        id: n.id,
        to: n.to,
        template: n.template,
        status: n.status,
        message_id: n.external_id ?? null,
        bounced: bounceOf.has(n.id)
          ? {
              at: bounceOf.get(n.id)!.bounced_at,
              reason: bounceOf.get(n.id)!.reason,
              label: REASON_LABEL[bounceOf.get(n.id)!.reason as BounceReason] ?? bounceOf.get(n.id)!.reason,
              recipient: bounceOf.get(n.id)!.recipient,
              status_code: bounceOf.get(n.id)!.status_code,
              diagnostic: bounceOf.get(n.id)!.diagnostic,
            }
          : null,
        sent_at: n.created_at,
        viewed: v
          ? {
              first_viewed_at: v.first_viewed_at,
              last_viewed_at: v.last_viewed_at,
              view_count: v.view_count,
              ip: v.last_ip,
              user_agent: v.last_user_agent,
              country: v.country,
              city: v.city,
            }
          : null,
      }
    }),
  })
}
