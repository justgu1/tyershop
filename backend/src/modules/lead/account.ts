import { randomBytes } from "crypto"
import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createCustomersWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Garante cliente + login por e-mail para quem está na lista. A senha é aleatória (a pessoa define a sua depois);
 * como a identidade já existe, ninguém consegue registrar a conta de outra pessoa com o e-mail dela.
 *
 * `ownerProved` (resgate do ingresso: só quem lê o e-mail tem o link): uma conta que já existia com senha
 * escolhida por outra pessoa (cadastro antecipado com o e-mail alheio) tem a senha trocada por uma aleatória,
 * então só o dono verdadeiro entra, pelo link ou por "esqueci minha senha".
 */
export async function ensureAccount(scope: MedusaContainer, email: string, name?: string | null, opts: { ownerProved?: boolean } = {}) {
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
  if (authIdentity && opts.ownerProved && !authIdentity.app_metadata?.lead_account) {
    await authModule.updateProvider("emailpass", { entity_id: email, password: randomBytes(24).toString("hex") })
  }
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

  const trusted = !existing || opts.ownerProved
  if (authIdentity.app_metadata?.customer_id !== customer.id || (trusted && !authIdentity.app_metadata?.lead_account)) {
    authIdentity = await authModule.updateAuthIdentities({
      id: authIdentity.id,
      app_metadata: { ...(authIdentity.app_metadata ?? {}), customer_id: customer.id, ...(trusted ? { lead_account: true } : {}) },
    })
  }

  return { customer, authIdentity }
}
