import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import type { Logger, ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types"
import nodemailer, { Transporter } from "nodemailer"
import { LOGO_PNG_BASE64 } from "./logo"
import { LOGO_CID, renderTemplate } from "./templates"
import { isUndeliverable, readTestMode, resolveRecipient } from "./test-mode"

type Options = {
  host: string
  port: number
  secure?: boolean
  user?: string
  password?: string
  from: string
}

// Só os e-mails de lista levam o cabeçalho: o cliente de e-mail mostra o botão "cancelar inscrição". Com o link do site o
// cancelamento é de um clique (o próprio Gmail/Outlook chama a página); o mailto fica de reserva.
const LIST_TEMPLATES = ["lead_welcome", "ticket"]
const MAILTO = "<mailto:suporte@tyershop.com?subject=Sair%20da%20lista>"

function listHeaders(template: string, data: Record<string, any>): Record<string, string> | undefined {
  if (!LIST_TEMPLATES.includes(template)) return undefined
  if (!data.unsubscribe_url) return { "List-Unsubscribe": MAILTO }
  return { "List-Unsubscribe": `<${data.unsubscribe_url}>, ${MAILTO}`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
}

class SmtpNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "smtp"

  private transporter_: Transporter
  private options_: Options
  private logger_: Logger

  constructor({ logger }: { logger: Logger }, options: Options) {
    super()
    this.logger_ = logger
    this.options_ = options
    this.transporter_ = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: !!options.secure,
      auth: options.user ? { user: options.user, pass: options.password } : undefined,
    })
  }

  static validateOptions(options: Record<string, any>) {
    if (!options?.host || !options?.port || !options?.from) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "notification-smtp precisa de SMTP_HOST, SMTP_PORT e SMTP_FROM"
      )
    }
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    if (isUndeliverable(notification.to)) {
      this.logger_.info(`[smtp] ${notification.template} → ${notification.to} ignorado (endereço .invalid)`)
      return { id: "ignored-invalid" }
    }
    const rendered = renderTemplate(notification.template, (notification.data ?? {}) as Record<string, any>)
    // Redefinição de senha é a única que sempre vai ao destinatário real: quem pediu precisa receber.
    const { to, subject, redirectedFrom } =
      notification.template === "password_reset"
        ? { to: notification.to, subject: rendered.subject, redirectedFrom: undefined as string | undefined }
        : { ...resolveRecipient(notification.to, rendered.subject, readTestMode(process.env)) }
    // Em modo de teste o aviso do destinatário original vai no corpo, não no assunto.
    const note = redirectedFrom ? `Modo de teste: este e-mail seria enviado para ${redirectedFrom}.` : ""
    const html = note
      ? rendered.html.replace(/<body[^>]*>/, (m) => `${m}<div style="background:#fff7ed;color:#9a3412;font:12px Helvetica,Arial,sans-serif;padding:8px 12px;text-align:center">${note.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</div>`)
      : rendered.html
    const text = note ? `${note}\n\n${rendered.text}` : rendered.text

    const info = await this.transporter_.sendMail({
      from: this.options_.from,
      to,
      subject,
      html,
      text,
      headers: listHeaders(notification.template, (notification.data ?? {}) as Record<string, any>),
      attachments: [
        {
          filename: "tyer.png",
          content: Buffer.from(LOGO_PNG_BASE64, "base64"),
          cid: LOGO_CID,
          contentType: "image/png",
        },
        ...(notification.attachments ?? []).map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content, "base64"),
          contentType: a.content_type,
        })),
      ],
    })
    this.logger_.info(`[smtp] ${notification.template} → ${to} (${info.messageId})`)
    return { id: info.messageId }
  }
}

export default SmtpNotificationProviderService
