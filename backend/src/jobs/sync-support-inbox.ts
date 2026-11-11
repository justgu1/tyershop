import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ImapFlow } from "imapflow"
import nodemailer from "nodemailer"
import { EMAIL_VIEW_MODULE } from "../modules/email-view"
import type EmailViewModuleService from "../modules/email-view/service"
import { headerOf, parseBounce, REASON_LABEL } from "../modules/email-view/bounce"
import { classifyInbox, INBOX_FOLDERS, plainTextOf } from "../modules/email-view/inbox-rules"

const MAX_PER_RUN = 100
let running = false

async function recordBounce(container: MedusaContainer, raw: string, ownDomain: string, when: Date) {
  const logger = container.resolve("logger") as any
  const bounce = parseBounce(raw, ownDomain)
  if (!bounce) return logger.warn("[caixa de suporte] devolução sem Message-ID nosso; só foi arquivada")
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const { rows } = await pg.raw(`select id, template, "to" from notification where external_id = ? and deleted_at is null limit 1`, [bounce.messageId])
  const notification = rows[0] as { id: string; template: string; to: string } | undefined
  if (!notification) return logger.warn(`[caixa de suporte] devolução de ${bounce.messageId} sem notificação correspondente`)
  const views = container.resolve<EmailViewModuleService>(EMAIL_VIEW_MODULE)
  if ((await views.listEmailBounces({ notification_id: notification.id }, { take: 1 })).length) return
  await views.createEmailBounces({
    notification_id: notification.id,
    message_id: bounce.messageId,
    recipient: bounce.recipient,
    status_code: bounce.status,
    reason: bounce.reason,
    diagnostic: bounce.diagnostic,
    bounced_at: when,
  })
  logger.warn(`[e-mail devolvido] ${notification.template} para ${notification.to}: ${REASON_LABEL[bounce.reason]} (${bounce.status ?? "?"})`)
}

async function forwardReply(from: string, subject: string, source: Buffer) {
  const to = process.env.SMTP_REPLY_TO?.trim()
  if (!to) return false
  const port = Number(process.env.SMTP_PORT) || undefined
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  })
  const body = plainTextOf(source.toString("utf8"))
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    replyTo: from,
    subject: `[Resposta de cliente] ${subject}`,
    text: `${from} respondeu à Tyer. Responder a este e-mail fala direto com o cliente.\n\n---\n${body || "(sem texto, veja o anexo)"}`,
    attachments: [{ filename: "mensagem.eml", content: source, contentType: "message/rfc822" }],
  })
  return true
}

async function run(container: MedusaContainer) {
  const logger = container.resolve("logger") as any
  const ownDomain = process.env.SMTP_FROM?.match(/@([^>\s]+)/)?.[1]
  if (!ownDomain) return
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || String(process.env.SMTP_HOST).replace(/^smtp\./, "imap."),
    port: 993,
    secure: true,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD! },
    logger: false,
  })
  await client.connect()
  try {
    const prefix = (await client.list()).some((b) => b.path.startsWith("INBOX.")) ? "INBOX." : ""
    for (const name of INBOX_FOLDERS) await client.mailboxCreate(`${prefix}${name}`).catch(() => undefined)
    const lock = await client.getMailboxLock("INBOX")
    try {
      const uids = ((await client.search({ all: true }, { uid: true })) || []).slice(0, MAX_PER_RUN)
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { envelope: true, source: true }, { uid: true })
        if (!msg || !msg.source) continue
        const raw = msg.source.toString("utf8")
        const from = msg.envelope?.from?.[0]?.address ?? ""
        const subject = msg.envelope?.subject ?? ""
        const { folder, customerReply } = classifyInbox({ from, subject, autoSubmitted: headerOf(raw, "Auto-Submitted") }, ownDomain)
        try {
          if (folder === "Devolvidos") await recordBounce(container, raw, ownDomain, new Date(msg.envelope?.date ?? Date.now()))
          if (customerReply && !(await forwardReply(from, subject, msg.source))) continue
          await client.messageMove(String(uid), `${prefix}${folder}`, { uid: true })
        } catch (err) {
          logger.error(`[caixa de suporte] mensagem ${uid} fica na entrada: ${(err as Error).message}`)
        }
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => undefined)
  }
}

/** Arquiva a caixa de suporte por tipo, registra e-mails devolvidos no rastreio e encaminha respostas de clientes. */
export default async function syncSupportInbox(container: MedusaContainer) {
  if (running || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return
  running = true
  try {
    await run(container)
  } catch (err) {
    container.resolve("logger").error(`[caixa de suporte] ${(err as Error).message}`)
  } finally {
    running = false
  }
}

export const config = { name: "sync-support-inbox", schedule: "*/10 * * * *" }
