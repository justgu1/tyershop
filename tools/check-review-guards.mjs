#!/usr/bin/env node
// Toda entrada de docs/review-guards.md precisa apontar para um guard automático que existe: um arquivo de teste ou de
// checagem entre crases e, se houver, o nome do teste entre aspas dentro dele. A seção "Pendentes de guard" fica de fora.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join, relative, resolve as resolvePath } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolvePath(fileURLToPath(import.meta.url), "../..")
// Onde um guard automático pode morar; código de produção citado não conta.
const GUARD_ROOTS = ["backend/src", "backend/integration-tests", "frontend/src", "tools", ".github"]
const SKIP = new Set(["node_modules", ".git", "dist", ".medusa"])
const NOT_A_GUARD = /\b(pendente|sem teste|sem guard|a definir)\b/iu

const ledgerPath = process.argv[2] ?? join(ROOT, "docs/review-guards.md")
if (!existsSync(ledgerPath)) {
  console.error(`${ledgerPath} não encontrado.`)
  process.exit(1)
}

function* walk(dir) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* walk(full)
    else yield full
  }
}

const allFiles = GUARD_ROOTS.flatMap((root) => [...walk(join(ROOT, root))])

/** Aceita caminho relativo à raiz ou só o nome do arquivo (com ou sem extensão), dentro de GUARD_ROOTS. */
function resolveToken(token) {
  const direct = join(ROOT, token)
  if (GUARD_ROOTS.some((r) => token.startsWith(`${r}/`)) && existsSync(direct) && statSync(direct).isFile()) return direct
  if (!/^[\w.-]+$/.test(token)) return null
  return allFiles.find((f) => basename(f) === token || basename(f).replace(/\.[^.]+$/, "") === token) ?? null
}

/** Cada item de lista depois do primeiro título "## " é uma entrada; a introdução e os "Pendentes" ficam de fora. */
function entries(ledger) {
  const start = ledger.indexOf("\n## ")
  const body = start === -1 ? "" : ledger.slice(start)
  const out = []
  for (const section of body.split(/\n(?=## )/)) {
    if (/^\s*## Pendentes/i.test(section)) continue
    for (const m of section.matchAll(/^- \*\*(.+?)\*\*([\s\S]*?)(?=^- \*\*|^## |(?![\s\S]))/gm)) {
      const found = /^\s*Guard:([\s\S]*)$/m.exec(m[2])
      out.push([m[1].trim(), found ? found[1].replace(/\s+/g, " ") : null])
    }
  }
  return out
}

const failures = []
const list = entries(readFileSync(ledgerPath, "utf8"))
for (const [title, guard] of list) {
  if (guard === null) {
    failures.push(`"${title}": sem linha "Guard:".`)
    continue
  }
  if (NOT_A_GUARD.test(guard)) {
    failures.push(`"${title}": o guard ainda não existe (${guard.trim()}).`)
    continue
  }
  // Cada trecho `arquivo` ("nome do teste") é conferido junto: o nome precisa estar no arquivo citado logo antes dele.
  const pairs = [...guard.matchAll(/`([^`]+)`(?:\s*\("([^"]+(?:"[^"(]*)?)"\))?/g)]
  if (pairs.length === 0) {
    failures.push(`"${title}": o guard não cita entre crases nenhum teste ou checagem.`)
    continue
  }
  for (const [, token, testName] of pairs) {
    const file = resolveToken(token)
    if (!file) {
      failures.push(`"${title}": \`${token}\` não existe (procurado em ${GUARD_ROOTS.join(", ")}).`)
      continue
    }
    if (testName && !readFileSync(file, "utf8").includes(testName)) {
      failures.push(`"${title}": o teste "${testName}" não está em ${relative(ROOT, file)}.`)
    }
  }
}

if (failures.length) {
  console.error(`Guards de review inválidos (${ledgerPath}):\n\n- ${failures.join("\n- ")}`)
  process.exit(1)
}
console.log(`${list.length} guard(s) de review conferido(s).`)
