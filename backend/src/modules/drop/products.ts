import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { DROP_MODULE } from "./index"

export async function getDropProductIds(scope: MedusaContainer, dropId: string): Promise<string[]> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "drop", fields: ["id", "products.id"], filters: { id: dropId } })
  return ((data[0] as any)?.products ?? []).map((p: { id: string }) => p.id)
}

const linkOf = (dropId: string, productId: string) => ({
  [DROP_MODULE]: { drop_id: dropId },
  [Modules.PRODUCT]: { product_id: productId },
})

/** Troca o conjunto de produtos do drop: remove os que saíram e cria os novos. */
export async function setDropProducts(scope: MedusaContainer, dropId: string, productIds: string[]) {
  const link = scope.resolve(ContainerRegistrationKeys.LINK)
  const current = await getDropProductIds(scope, dropId)
  const wanted = new Set(productIds)

  const remove = current.filter((id) => !wanted.has(id))
  const add = productIds.filter((id) => !current.includes(id))

  if (remove.length) await link.dismiss(remove.map((id) => linkOf(dropId, id)))
  if (add.length) await link.create(add.map((id) => linkOf(dropId, id)))
  return productIds
}
