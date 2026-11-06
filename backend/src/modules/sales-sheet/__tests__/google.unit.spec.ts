import { generateKeyPairSync, createVerify } from "node:crypto"
import { parseServiceAccount, signJwt } from "../google"

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } })
const sa = { client_email: "sheet@proj.iam.gserviceaccount.com", private_key: privateKey }

describe("conta de serviço", () => {
  it("aceita JSON puro ou base64", () => {
    const json = JSON.stringify(sa)
    expect(parseServiceAccount(json).client_email).toBe(sa.client_email)
    expect(parseServiceAccount(Buffer.from(json).toString("base64")).client_email).toBe(sa.client_email)
  })

  it("recusa JSON sem chave privada", () => {
    expect(() => parseServiceAccount('{"client_email":"a"}')).toThrow(/private_key/)
  })

  it("assina o JWT com RS256 e escopo de planilhas", () => {
    const [h, c, s] = signJwt(sa, 1000).split(".")
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toMatchObject({ iss: sa.client_email, scope: expect.stringContaining("spreadsheets"), exp: 4600 })
    expect(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true)
  })
})
