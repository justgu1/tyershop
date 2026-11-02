import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"
import { passwordResetUrl } from "../utils/password-reset-url"

/**
 * O Medusa dispara `auth.password_reset` ao pedir a redefinição, mas não envia e-mail:
 * este subscriber manda pelo mesmo provider SMTP e template visual dos demais e-mails (cliente da loja e admin).
 */
type PasswordResetEvent = {
  entity_id: string // e-mail, no provider emailpass
  actor_type: string
  token: string
}

export default async function passwordResetHandler({ event: { data }, container }: SubscriberArgs<PasswordResetEvent>) {
  const resetUrl = passwordResetUrl(data.actor_type, data.token, data.entity_id, process.env)
  if (!resetUrl) return

  try {
    await container.resolve(Modules.NOTIFICATION).createNotifications({
      to: data.entity_id,
      channel: "email",
      template: "password_reset",
      data: {
        email: data.entity_id,
        reset_url: resetUrl,
      },
    })
  } catch (err) {
    // Falha de e-mail não pode derrubar o pedido: a resposta 201 já saiu.
    container.resolve("logger").error(`E-mail de redefinição de senha não enviado: ${(err as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
