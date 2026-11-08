import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { EMAIL_VIEW_MODULE } from "../../../../../modules/email-view"
import EmailViewModuleService from "../../../../../modules/email-view/service"
import { nextViewState } from "../../../../../modules/email-view/record"
import { canViewInBrowser, validViewToken } from "../../../../../modules/email-view/token"
import { renderForBrowser } from "../../../../../modules/notification-smtp/templates"

const Body = z.object({
  token: z.string().min(1).max(64),
  ip: z.string().max(64).nullish(),
  user_agent: z.string().max(500).nullish(),
  country: z.string().max(8).nullish(),
  city: z.string().max(100).nullish(),
})

const invalid = () => new MedusaError(MedusaError.Types.INVALID_DATA, "Link inválido.")

/**
 * Devolve o HTML do e-mail e registra a visualização. A chamada vem do servidor do site (que repassa IP e local do
 * visitante); o token assinado pelo id da notificação é o que prova que o link veio do e-mail.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = Body.safeParse(req.body)
  const id = String(req.params.id ?? "")
  if (!parsed.success || !validViewToken(id, parsed.data.token)) throw invalid()

  const notifications = req.scope.resolve(Modules.NOTIFICATION)
  const notification = await notifications.retrieveNotification(id).catch(() => null)
  if (!notification || !canViewInBrowser(notification.template)) throw invalid()

  const views = req.scope.resolve<EmailViewModuleService>(EMAIL_VIEW_MODULE)
  const [previous] = await views.listEmailViews({ notification_id: id }, { take: 1 })
  const state = nextViewState(previous, parsed.data)
  if (previous) await views.updateEmailViews({ id: previous.id, ...state })
  else await views.createEmailViews({ notification_id: id, ...state })

  res.json({ html: renderForBrowser(notification.template, (notification.data ?? {}) as Record<string, any>) })
}
