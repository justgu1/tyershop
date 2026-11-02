import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import type { Logger, ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types"
import nodemailer, { Transporter } from "nodemailer"
import { LOGO_PNG_BASE64 } from "./logo"
import { LOGO_CID, renderTemplate } from "./templates"
import { readTestMode, resolveRecipient } from "./test-mode"

type Options = {
  host: string
  port: number
  secure?: boolean
  user?: string
  password?: string
  from: string
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
    const rendered = renderTemplate(notification.template, (notification.data ?? {}) as Record<string, any>)
    // Redefinição de senha é a única que sempre vai ao destinatário real: quem pediu precisa receber.
    const { to, subject } =
      notification.template === "password_reset"
        ? { to: notification.to, subject: rendered.subject }
        : resolveRecipient(notification.to, rendered.subject, readTestMode(process.env))

    const info = await this.transporter_.sendMail({
      from: this.options_.from,
      to,
      subject,
      html: rendered.html,
      text: rendered.text,
      attachments: [
        {
          filename: "tyer.png",
          content: Buffer.from(LOGO_PNG_BASE64, "base64"),
          cid: LOGO_CID,
          contentType: "image/png",
        },
      ],
    })
    this.logger_.info(`[smtp] ${notification.template} → ${to} (${info.messageId})`)
    return { id: info.messageId }
  }
}

export default SmtpNotificationProviderService
