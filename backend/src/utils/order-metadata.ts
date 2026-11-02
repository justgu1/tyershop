import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const pg = (scope: MedusaContainer) => scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any

/**
 * Troca só uma chave do `metadata` do pedido, no próprio banco: gravar o objeto inteiro de volta apagaria o que outra
 * rotina (etiqueta, nota fiscal) escreveu em outra chave no meio tempo. `null` remove a chave.
 */
export async function setMetadataKey(scope: MedusaContainer, orderId: string, key: string, value: unknown) {
  if (value === null) {
    await pg(scope).raw(`update "order" set metadata = coalesce(metadata, '{}'::jsonb) - ?::text, updated_at = now() where id = ?`, [key, orderId])
    return
  }
  await pg(scope).raw(
    `update "order" set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), array[?]::text[], ?::jsonb), updated_at = now() where id = ?`,
    [key, JSON.stringify(value), orderId]
  )
}

/** Marca a chave só se ainda não existir; devolve se foi esta chamada que marcou (base para enviar algo uma única vez). */
export async function claimMetadataKey(scope: MedusaContainer, orderId: string, key: string, value: unknown): Promise<boolean> {
  const { rowCount } = await pg(scope).raw(
    `update "order" set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), array[?]::text[], ?::jsonb), updated_at = now()
      where id = ? and not jsonb_exists(coalesce(metadata, '{}'::jsonb), ?::text)`,
    [key, JSON.stringify(value), orderId, key]
  )
  return rowCount > 0
}
