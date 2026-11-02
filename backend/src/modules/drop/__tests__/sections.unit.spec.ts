import { buildSections } from "../sections"

const col = (id: string, title: string, metadata: Record<string, unknown> = {}) => ({ id, handle: id, title, metadata })

describe("buildSections", () => {
  it("agrupa os produtos por coleção, uma faixa para cada", () => {
    const sections = buildSections([
      { id: "p1", collection: col("c1", "Tyer Gang") },
      { id: "p2", collection: col("c2", "Caçada") },
      { id: "p3", collection: col("c2", "Caçada") },
    ])
    expect(sections.map((s) => [s.title, s.product_ids])).toEqual([
      ["Caçada", ["p2", "p3"]],
      ["Tyer Gang", ["p1"]],
    ])
  })

  it("ordena por metadata.order e leva banner e rótulo da coleção", () => {
    const sections = buildSections([
      { id: "p1", collection: col("c2", "Caçada", { order: 2, banner_url: " https://cdn/b.jpg ", label: "Cápsula" }) },
      { id: "p2", collection: col("c1", "Tyer Gang", { order: 1 }) },
    ])
    expect(sections.map((s) => s.title)).toEqual(["Tyer Gang", "Caçada"])
    expect(sections[1]).toMatchObject({ banner_url: "https://cdn/b.jpg", label: "Cápsula" })
    expect(sections[0].banner_url).toBeNull()
  })

  it("produto sem coleção não some: vai na última faixa, sem título", () => {
    const sections = buildSections([
      { id: "p1" },
      { id: "p2", collection: col("c1", "Tyer Gang", { order: 1 }) },
    ])
    expect(sections.map((s) => [s.title, s.product_ids])).toEqual([
      ["Tyer Gang", ["p2"]],
      ["", ["p1"]],
    ])
  })
})
