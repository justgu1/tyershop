import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"

test("o secrets.env de produção é ignorado pelo git", () => {
  const r = spawnSync("git", ["check-ignore", "-q", "k8s/prod/secrets.env"])
  assert.equal(r.status, 0, "k8s/prod/secrets.env não está no .gitignore: um `git add -A` o enviaria ao remoto")
})
