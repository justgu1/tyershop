import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"

test("o secrets.env de produção é ignorado pelo git", () => {
  const r = spawnSync("git", ["check-ignore", "-q", "k8s/prod/secrets.env"])
  assert.equal(r.status, 0, "k8s/prod/secrets.env não está no .gitignore: um `git add -A` o enviaria ao remoto")
})

test("o ID da planilha não aparece em arquivo versionado", () => {
  const grep = spawnSync("git", ["grep", "-lE", "docs.google.com/spreadsheets/d/[A-Za-z0-9_-]{20,}", "--", ".", ":!tools/segredos-ignorados.test.mjs"], { encoding: "utf8" })
  assert.equal(grep.stdout.trim(), "", `link de planilha em arquivo versionado: ${grep.stdout}`)
  const manifest = readFileSync("k8s/base/backend.yaml", "utf8")
  const block = manifest.split("name: GOOGLE_SHEETS_SPREADSHEET_ID")[1]?.split("- name:")[0] ?? ""
  assert.match(block, /secretKeyRef/, "GOOGLE_SHEETS_SPREADSHEET_ID precisa vir de Secret, nunca de `value:`")
})
