import { buildAdditionalInfo } from "../additional-info"

describe("buildAdditionalInfo", () => {
  const cart = {
    items: [{ product_id: "prod_1", title: "Camiseta Tyer", quantity: 2, unit_price: 299.9 }],
    shipping_address: { phone: "+55 (11) 91234-5678", postal_code: "01310-100", address_1: "Av. Paulista, 1000", city: "São Paulo", province: "SP" },
  }

  it("leva itens, telefone separado em DDD e número e o endereço de entrega", () => {
    const info = buildAdditionalInfo(cart, { firstName: "Ana", lastName: "Silva" })
    expect(info.items).toEqual([{ id: "prod_1", title: "Camiseta Tyer", quantity: 2, unit_price: 299.9 }])
    expect(info.payer).toEqual({ first_name: "Ana", last_name: "Silva", phone: { area_code: "11", number: "912345678" } })
    expect(info.shipments.receiver_address).toEqual({
      zip_code: "01310100", state_name: "SP", city_name: "São Paulo", street_name: "Av. Paulista", street_number: "1000",
    })
  })

  it("omite o que não tem, em vez de mandar vazio", () => {
    const info = buildAdditionalInfo({ items: [], shipping_address: null }, {})
    expect(info).toEqual({ payer: {} })
  })

  it("sem carrinho não manda nada", () => {
    expect(buildAdditionalInfo(null, {})).toBeUndefined()
  })
})
