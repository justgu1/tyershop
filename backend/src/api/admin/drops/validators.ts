import { z } from "@medusajs/framework/zod"

const date = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "data inválida")
const optionalText = z.string().trim().nullable().optional()

const dropFields = {
  handle: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use minúsculas, números e hífen"),
  title: z.string().trim().min(1),
  subtitle: optionalText,
  preorder_starts_at: date,
  preorder_ends_at: date,
  general_starts_at: date.nullable().optional(),
  general_ends_at: date,
  general_lot: z.number().int().positive().nullable().optional(),
  closed_at: date.nullable().optional(),
  production_days: z.number().int().positive().optional(),
  release_leads_in_presale: z.boolean().optional(),
  component_key: optionalText,
  hero_kind: z.enum(["community_video", "drop_video", "banner"]).optional(),
  hero_url: optionalText,
  cover_url: optionalText,
  instagram_url: optionalText,
  whatsapp_url: optionalText,
  is_current: z.boolean().optional(),
}

const ordered = (d: {
  preorder_starts_at?: string
  preorder_ends_at?: string
  general_starts_at?: string | null
  general_ends_at?: string
}) => {
  const t = (v?: string | null) => (v ? new Date(v).getTime() : undefined)
  const ps = t(d.preorder_starts_at)
  const pe = t(d.preorder_ends_at)
  const gs = t(d.general_starts_at) ?? pe
  const ge = t(d.general_ends_at)
  if (ps === undefined || pe === undefined || ge === undefined) return true
  return ps < pe && (gs as number) >= pe && ge > (gs as number)
}

export const CreateDropSchema = z
  .object(dropFields)
  .refine(ordered, "as datas precisam seguir: início < fim da pré-venda ≤ início geral < fim geral")

export const UpdateDropSchema = z.object(dropFields).partial()

export type CreateDropBody = z.infer<typeof CreateDropSchema>
export type UpdateDropBody = z.infer<typeof UpdateDropSchema>
