import { nextViewState } from "../record"

const t0 = new Date("2026-11-08T10:00:00Z")
const t1 = new Date("2026-11-08T11:00:00Z")

describe("nextViewState", () => {
  it("starts a first view with count 1 and the hit data", () => {
    const s = nextViewState(null, { ip: "203.0.113.5", user_agent: "UA", country: "BR", city: "Recife" }, t0)
    expect(s).toMatchObject({ first_viewed_at: t0, last_viewed_at: t0, view_count: 1, last_ip: "203.0.113.5", country: "BR", city: "Recife" })
  })

  it("keeps the first date, counts up and replaces the last access", () => {
    const s = nextViewState({ first_viewed_at: t0, view_count: 2 }, { ip: "198.51.100.1" }, t1)
    expect(s.first_viewed_at).toEqual(t0)
    expect(s.last_viewed_at).toEqual(t1)
    expect(s.view_count).toBe(3)
    expect(s.last_ip).toBe("198.51.100.1")
  })

  it("stores missing or blank fields as null and caps long ones", () => {
    const s = nextViewState(null, { ip: "  ", user_agent: "x".repeat(1000) }, t0)
    expect(s.last_ip).toBeNull()
    expect(s.city).toBeNull()
    expect(s.last_user_agent).toHaveLength(300)
  })
})
