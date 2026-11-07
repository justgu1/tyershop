import { existsSync } from "node:fs"
import { join } from "node:path"
import { MEDIDAS } from "../medidas-drop6"

describe("medidas do drop 6", () => {
  it("cada peça aponta para uma imagem de medidas que existe no frontend", () => {
    for (const rel of Object.values(MEDIDAS)) {
      expect(rel).toMatch(/\/medidas\.webp$/)
      expect(existsSync(join(__dirname, "../../../../frontend/public/produtos", rel))).toBe(true)
    }
  })
})
