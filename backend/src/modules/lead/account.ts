import { randomBytes } from "crypto"
import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createCustomersWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Garante cliente + login por e-mail para quem está na lista. A senha é aleatória (a pessoa define a sua depois);
 * como a identidade já existe, ninguém consegue registrar a conta de outra pessoa com o e-mail dela.
 */
export async function ensureAccount(scope: MedusaContainer, email: string, name?: string | null) {
  const customerModule = scope.resolve(Modules.CUSTOMER) as any
  const authModule = scope.resolve(Modules.AUTH) as any

  let [customer] = await customerModule.listCustomers({ email }, { take: 1 })
  if (!customer) {
    const { result } = await createCustomersWorkflow(scope).run({
      input: { customersData: [{ email, first_name: name?.split(" ")[0] ?? undefined, has_account: true }] },
    })
    customer = result[0]
  } else if (!customer.has_account) {
    customer = await customerModule.updateCustomers(customer.id, { has_account: true })
  }

  const [existing] = await authModule.listAuthIdentities(
    { provider_identities: { entity_id: email, provider: "emailpass" } },
    { relations: ["provider_identities"], take: 1 }
  )

  let authIdentity = existing
  if (!authIdentity) {
    const registered = await authModule.register("emailpass", {
      body: { email, password: randomBytes(24).toString("hex") },
      url: "",
      headers: {},
      query: {},
      protocol: "",
    })
    if (!registered.success) throw new Error("Não foi possível criar a conta")
    authIdentity = registered.authIdentity
  }

  if (authIdentity.app_metadata?.customer_id !== customer.id) {
    authIdentity = await authModule.updateAuthIdentities({
      id: authIdentity.id,
      app_metadata: { customer_id: customer.id },
    })
  }

  return { customer, authIdentity }
}
