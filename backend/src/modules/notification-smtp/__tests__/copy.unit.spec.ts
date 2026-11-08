import { copyOptions } from "../copy"

const env = { SMTP_BCC: "suporte@tyershop.com", SMTP_REPLY_TO: "eu@gmail.com" }

describe("copyOptions", () => {
  it("copies every e-mail to the shared mailbox and sets the reply address", () => {
    expect(copyOptions("ticket", "cliente@x.com", env)).toEqual({ replyTo: "eu@gmail.com", bcc: "suporte@tyershop.com" })
  })

  it("never copies the password reset link", () => {
    expect(copyOptions("password_reset", "cliente@x.com", env)).toEqual({ replyTo: "eu@gmail.com" })
  })

  it("does not copy when the recipient is the mailbox itself", () => {
    expect(copyOptions("ticket", " Suporte@Tyershop.com ", env)).toEqual({ replyTo: "eu@gmail.com" })
  })

  it("adds nothing when not configured", () => {
    expect(copyOptions("ticket", "cliente@x.com", {})).toEqual({})
  })
})
