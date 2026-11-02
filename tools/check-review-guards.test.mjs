import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

const run = (ledger) => {
  const dir = mkdtempSync(join(tmpdir(), "guards-"))
  const file = join(dir, "ledger.md")
  writeFileSync(file, ledger)
  return spawnSync("node", ["tools/check-review-guards.mjs", file], { encoding: "utf8" })
}
const entry = (guard) => `intro\n\n## Seção\n\n- **Regra X.**\n  Origem: PR 1.\n  ${guard}\n`

test("aceita um guard que existe, com o nome do teste dentro do arquivo", () => {
  const r = run(entry('Guard: `label.unit.spec.ts` ("vai no pedido quando informado e some quando não").'))
  assert.equal(r.status, 0, r.stderr)
})

test("recusa entrada sem guard", () => {
  assert.notEqual(run("intro\n\n## Seção\n\n- **Regra X.**\n  Origem: PR 1.\n").status, 0)
})

test("recusa guard pendente", () => {
  assert.notEqual(run(entry("Guard: pendente.")).status, 0)
})

test("recusa arquivo de teste que não existe", () => {
  assert.notEqual(run(entry("Guard: `nao-existe.unit.spec.ts`.")).status, 0)
})

test("recusa nome de teste que não está no arquivo", () => {
  assert.notEqual(run(entry('Guard: `label.unit.spec.ts` ("teste inventado").')).status, 0)
})

test("a seção Pendentes de guard não é cobrada", () => {
  assert.equal(run("intro\n\n## Pendentes de guard\n\n- **Regra Y.**\n  Origem: PR 2.\n").status, 0)
})
