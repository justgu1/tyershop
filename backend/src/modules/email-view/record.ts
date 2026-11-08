export type ViewHit = { ip?: string | null; user_agent?: string | null; country?: string | null; city?: string | null }
const clean = (v?: string | null, max = 200) => (v ? String(v).trim().slice(0, max) || null : null)

/** Estado gravado após uma visualização: a primeira data fica, o contador sobe e o último acesso substitui o anterior. */
export function nextViewState(
  previous: { first_viewed_at: Date | string; view_count: number } | null | undefined,
  hit: ViewHit,
  now: Date = new Date()
) {
  return {
    first_viewed_at: previous ? new Date(previous.first_viewed_at) : now,
    last_viewed_at: now,
    view_count: (previous?.view_count ?? 0) + 1,
    last_ip: clean(hit.ip, 64),
    last_user_agent: clean(hit.user_agent, 300),
    country: clean(hit.country, 8),
    city: clean(hit.city, 100),
  }
}
