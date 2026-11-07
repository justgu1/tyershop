import { existsSync } from "node:fs"
import { join } from "node:path"
import { isMedidas, medidasPorUltimo, NOVAS, renomear, RENOMEADAS } from "../medidas-galeria"

const publico = join(__dirname, "../../../../frontend/public/produtos")

describe("medidas na galeria", () => {
  it("a tabela de medidas é sempre a última imagem, sem mexer na ordem do resto", () => {
    expect(medidasPorUltimo(["/p/1.webp", "/p/medidas.webp", "/p/2.webp", "/p/3.webp"])).toEqual(["/p/1.webp", "/p/2.webp", "/p/3.webp", "/p/medidas.webp"])
    expect(medidasPorUltimo(["/p/1.webp", "/p/2.webp"])).toEqual(["/p/1.webp", "/p/2.webp"])
    expect(isMedidas("https://x.com/produtos/a/medidas.webp")).toBe(true)
    expect(isMedidas("https://x.com/produtos/a/6.webp")).toBe(false)
  })

  it("cada peça nova aponta para uma tabela que existe no frontend", () => {
    for (const rel of Object.values(NOVAS)) expect(existsSync(join(publico, rel))).toBe(true)
  })

  it("as tabelas renomeadas (Starter, regata Savage Mode e jaqueta) existem com o novo nome", () => {
    expect(renomear("tyertech", "https://x.com/produtos/tyer-tech/jaqueta/7.webp")).toBe("https://x.com/produtos/tyer-tech/jaqueta/medidas.webp")
    expect(renomear("tyertech", "https://x.com/produtos/tyer-tech/jaqueta/6.webp")).toBe("https://x.com/produtos/tyer-tech/jaqueta/6.webp")
    expect(Object.keys(RENOMEADAS).sort()).toEqual(["camiseta-tyer-starter-dry-fit", "regata-savage-mode", "tyertech"])
    for (const dir of ["tyer-starter/camiseta-preta", "tyer-starter/camiseta-branca", "exclusivos/tyer-savage-mode/regata-preta", "exclusivos/tyer-savage-mode/regata-branca", "tyer-tech/jaqueta"]) {
      expect(existsSync(join(publico, dir, "medidas.webp"))).toBe(true)
    }
  })
})
