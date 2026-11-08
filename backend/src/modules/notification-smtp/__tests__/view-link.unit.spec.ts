import { renderForBrowser, renderTemplate } from "../templates"

const URL = "https://tyer.test/email/noti_1?t=abc"
const base = { email: "a@b.com", unsubscribe_url: "https://tyer.test/sair", name: "Ana" }

describe("view-in-browser link", () => {
  it("adds the link to the html and the text, after the preview text", () => {
    const mail = renderTemplate("lead_welcome", { ...base, view_url: URL })
    expect(mail.html).toContain(`href="${URL}"`)
    expect(mail.html.indexOf("display:none")).toBeLessThan(mail.html.indexOf(URL))
    expect(mail.text).toContain(URL)
  })

  it("leaves the e-mail untouched without view_url", () => {
    const mail = renderTemplate("lead_welcome", base)
    expect(mail.html).not.toContain("Abra no navegador")
    expect(mail.text).not.toContain("Abra no navegador")
  })

  it("renders the browser page with the logo embedded instead of cid", () => {
    const html = renderForBrowser("lead_welcome", base)
    expect(html).not.toContain("cid:")
    expect(html).toContain("data:image/png;base64,")
  })
})
