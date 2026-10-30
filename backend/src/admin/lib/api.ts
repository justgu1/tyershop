declare const __BASE__: string | undefined

export async function adminFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  })
  if (res.status === 401 || res.status === 403) {
    window.location.href = `${typeof __BASE__ === "string" ? __BASE__.replace(/\/$/, "") : "/app"}/login`
    throw new Error("unauthorized")
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.message || "Falha na requisição")
  return body as T
}

export function toLocalInput(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null
}

export const ui = {
  input: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #d1d5db",
    fontSize: 14,
    marginTop: 4,
    marginBottom: 12,
    boxSizing: "border-box",
  } as const,
  label: { fontSize: 13, fontWeight: 600, color: "#374151" } as const,
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
  } as const,
  button: {
    background: "#e77e23",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  } as const,
  ghost: {
    background: "#fff",
    color: "#374151",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  } as const,
}
