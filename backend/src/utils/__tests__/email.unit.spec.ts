import { domainAcceptsMail, emailProblem, suggestDomain } from "../email"

describe("e-mail do checkout", () => {
  it("recusa domínio de provedor conhecido escrito errado e sugere o certo", () => {
    expect(suggestDomain("gamail.com")).toBe("gmail.com")
    expect(suggestDomain("gmial.com")).toBe("gmail.com")
    expect(suggestDomain("hotmial.com")).toBe("hotmail.com")
    expect(emailProblem("guilherme@gamail.com")).toContain("@gmail.com")
  })

  it("aceita domínios corretos e desconhecidos", () => {
    expect(emailProblem("a@gmail.com")).toBeNull()
    expect(emailProblem("a@exata.it")).toBeNull()
    expect(emailProblem("a@minhaempresa.com.br")).toBeNull()
  })

  it("recusa formato inválido", () => {
    for (const e of ["", "a", "a@", "a@b", "a@b.", "a b@gmail.com", "a@gmail..com"]) expect(emailProblem(e)).not.toBeNull()
  })

  it("o domínio reservado .invalid segue aceito, para a carga simular clientes", async () => {
    expect(await domainAcceptsMail("cliente1.carga.invalid")).toBe(true)
  })
})
