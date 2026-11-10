import { nextPhaseChange, resolveDropPhase } from "../phase"

const drop = {
  preorder_starts_at: "2026-11-01T12:00:00Z",
  preorder_ends_at: "2026-11-05T12:00:00Z",
  general_ends_at: "2026-11-10T12:00:00Z",
  general_lot: 100,
}
const at = (iso: string) => new Date(iso)

describe("resolveDropPhase", () => {
  it("is coming_soon before the presale opens", () => {
    expect(resolveDropPhase(drop, at("2026-10-31T00:00:00Z"))).toBe("coming_soon")
  })

  it("is presale between presale start and end", () => {
    expect(resolveDropPhase(drop, at("2026-11-01T12:00:00Z"))).toBe("presale")
    expect(resolveDropPhase(drop, at("2026-11-05T11:59:59Z"))).toBe("presale")
  })

  it("is general once the presale ends", () => {
    expect(resolveDropPhase(drop, at("2026-11-05T12:00:00Z"))).toBe("general")
  })

  it("honours an explicit general start after the presale end", () => {
    const d = { ...drop, general_starts_at: "2026-11-06T12:00:00Z" }
    expect(resolveDropPhase(d, at("2026-11-05T18:00:00Z"))).toBe("presale")
    expect(resolveDropPhase(d, at("2026-11-06T12:00:00Z"))).toBe("general")
  })

  it("ends when the lot is sold out", () => {
    expect(resolveDropPhase(drop, at("2026-11-06T00:00:00Z"), 100)).toBe("ended")
    expect(resolveDropPhase(drop, at("2026-11-06T00:00:00Z"), 99)).toBe("general")
  })

  it("ends on the final date even with lot left", () => {
    expect(resolveDropPhase(drop, at("2026-11-10T12:00:00Z"), 0)).toBe("ended")
  })

  it("keeps selling past the final date while sell_until_sold_out is on", () => {
    const d = { ...drop, general_lot: null, sell_until_sold_out: true }
    expect(resolveDropPhase(d, at("2026-11-30T00:00:00Z"))).toBe("general")
    expect(nextPhaseChange(d, "general")).toBeNull()
  })

  it("still ends on closed_at and on the lot with sell_until_sold_out", () => {
    const d = { ...drop, sell_until_sold_out: true }
    expect(resolveDropPhase({ ...d, closed_at: "2026-11-12T00:00:00Z" }, at("2026-11-13T00:00:00Z"))).toBe("ended")
    expect(resolveDropPhase(d, at("2026-11-30T00:00:00Z"), 100)).toBe("ended")
  })

  it("runs until the final date when there is no lot", () => {
    const d = { ...drop, general_lot: null }
    expect(resolveDropPhase(d, at("2026-11-09T00:00:00Z"), 5000)).toBe("general")
  })

  it("ends when closed manually", () => {
    const d = { ...drop, closed_at: "2026-11-02T00:00:00Z" }
    expect(resolveDropPhase(d, at("2026-11-03T00:00:00Z"))).toBe("ended")
  })
})

describe("nextPhaseChange", () => {
  it("points to the next boundary", () => {
    expect(nextPhaseChange(drop, "coming_soon")?.toISOString()).toBe("2026-11-01T12:00:00.000Z")
    expect(nextPhaseChange(drop, "presale")?.toISOString()).toBe("2026-11-05T12:00:00.000Z")
    expect(nextPhaseChange(drop, "general")?.toISOString()).toBe("2026-11-10T12:00:00.000Z")
    expect(nextPhaseChange(drop, "ended")).toBeNull()
  })
})
