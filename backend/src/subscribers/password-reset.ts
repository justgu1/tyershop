import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

/**
 * O Medusa dispara `auth.password_reset` ao pedir a redefinição, mas não envia e-mail:
 * este subscriber manda pelo mesmo provider SMTP e template visual dos demais e-mails.
 */
type PasswordResetEvent = {
  entity_id: string // e-mail, no provider emailpass
  actor_type: string
  token: string
}

export default async function passwordResetHandler({ event: { data }, container }: SubscriberArgs<PasswordResetEvent>) {
  if (data.actor_type !== "customer") return // só cobre reset de cliente da loja

  const siteUrl = (process.env.SITE_URL || "http://localhost:4321").replace(/\/$/, "")
  try {
    await container.resolve(Modules.NOTIFICATION).createNotifications({
      to: data.entity_id,
      channel: "email",
      template: "password_reset",
      data: {
        email: data.entity_id,
        reset_url: `${siteUrl}/account/reset-password?token=${encodeURIComponent(data.token)}`,
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
