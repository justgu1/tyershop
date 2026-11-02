import { agencyFromEnv, buildCartPayload, senderFromEnv, serviceIdOf } from "../label"

const env = {
  MELHOR_ENVIO_SENDER_NAME: "Tyer",
  MELHOR_ENVIO_SENDER_PHONE: "(11) 99999-0000",
  MELHOR_ENVIO_SENDER_EMAIL: "contato@tyershop.com",
  MELHOR_ENVIO_SENDER_DOCUMENT: "123.456.789-09",
  MELHOR_ENVIO_SENDER_ADDRESS: "Rua A",
  MELHOR_ENVIO_SENDER_NUMBER: "10",
  MELHOR_ENVIO_SENDER_DISTRICT: "Centro",
  MELHOR_ENVIO_SENDER_CITY: "Itapecerica da Serra",
  MELHOR_ENVIO_SENDER_STATE: "sp",
  MELHOR_ENVIO_FROM_ZIP: "06365-210",
}

describe("remetente", () => {
  it("monta o remetente só com números onde cabe", () => {
    const { sender, missing } = senderFromEnv(env)
    expect(missing).toEqual([])
    expect(sender).toMatchObject({ phone: "11999990000", document: "12345678909", state_abbr: "SP", postal_code: "06365210" })
  })

  it("lista o que falta", () => {
    const { sender, missing } = senderFromEnv({ ...env, MELHOR_ENVIO_SENDER_DOCUMENT: "", MELHOR_ENVIO_FROM_ZIP: "123" })
    expect(sender).toBeNull()
    expect(missing).toEqual(["DOCUMENT", "FROM_ZIP"])
  })
})

describe("serviço do envio", () => {
  it("lê o id da opção ou o nome do método", () => {
    expect(serviceIdOf({ data: { id: "melhorenvio-2" } })).toBe(2)
    expect(serviceIdOf({ name: "pac" })).toBe(1)
    expect(serviceIdOf({ name: "Outro" })).toBeNull()
  })
})

describe("carrinho do Melhor Envio", () => {
  it("leva endereço, CPF, itens, volume e declaração de conteúdo", () => {
    const { sender } = senderFromEnv(env)
    const payload = buildCartPayload({
      order: {
        display_id: 7,
        email: "ana@tyer.test",
        items: [{ title: "Camiseta", product_title: "Camiseta Red Rose", quantity: 2, unit_price: 60 }],
        shipping_address: {
          first_name: "Ana",
          last_name: "Souza",
          phone: "(11) 98888-7777",
          address_1: "Rua B",
          address_2: "20",
          city: "São Paulo",
          province: "sp",
          postal_code: "01000-000",
          metadata: { neighborhood: "Sé" },
        },
      },
      cpf: "987.654.321-00",
      serviceId: 1,
      sender: sender!,
      pkg: { height: 6, width: 25, length: 30, weight: 0.4 },
    })
    expect(payload.to).toMatchObject({ name: "Ana Souza", document: "98765432100", district: "Sé", state_abbr: "SP", postal_code: "01000000", number: "20" })
    expect(payload.products).toEqual([{ name: "Camiseta Red Rose", quantity: 2, unitary_value: 60 }])
    expect(payload.volumes[0]).toEqual({ height: 6, width: 25, length: 30, weight: 0.4 })
    expect(payload.options).toMatchObject({ non_commercial: true, insurance_value: 120 })
  })
})

describe("ponto de postagem", () => {
  it("lê o id do ambiente e ignora valor inválido", () => {
    expect(agencyFromEnv({ MELHOR_ENVIO_AGENCY_ID: "49666" })).toBe(49666)
    expect(agencyFromEnv({ MELHOR_ENVIO_AGENCY_ID: "abc" })).toBeNull()
    expect(agencyFromEnv({})).toBeNull()
  })
})
