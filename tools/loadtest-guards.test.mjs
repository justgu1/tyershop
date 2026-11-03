import assert from "node:assert/strict"
import { test } from "node:test"
import { CARGA_EMAIL, payRate, refusal } from "../loadtest/k6/guards.js"

const ok = { I_UNDERSTAND_THIS_CREATES_ORDERS: "yes" }

test("a carga nunca roda contra a produção, mesmo confirmada", () => {
  for (const host of ["https://tyershop.com", "https://www.tyershop.com/drop", "https://medusa.tyershop.com", "https://api.tyershop.com", "https://tyershop.com:443"]) {
    assert.match(refusal(host, host, ok), /produção/, host)
  }
  assert.match(refusal("https://homolog.tyershop.com", "https://tyershop.com", ok), /produção/)
})

test("a homologação roda só com a confirmação explícita", () => {
  assert.equal(refusal("https://homolog.tyershop.com", "https://homolog.tyershop.com", ok), null)
  assert.match(refusal("https://homolog.tyershop.com", "https://homolog.tyershop.com", {}), /I_UNDERSTAND/)
  assert.equal(refusal("http://localhost:4321", "http://localhost:9000", ok), null)
})

test("PAY_RATE vazio ou inválido vira 1 e não 0", () => {
  assert.equal(payRate(undefined), 1)
  assert.equal(payRate(""), 1)
  assert.equal(payRate("0.2"), 0.2)
  assert.equal(payRate("0"), 0)
  assert.equal(payRate("abc"), 1)
  assert.equal(payRate("7"), 1)
})

test("a limpeza reconhece só os e-mails criados pela carga", () => {
  assert.ok(CARGA_EMAIL.test("carga-123-4@carga-teste.invalid"))
  assert.ok(CARGA_EMAIL.test("carga+17-3@teste.local"))
  assert.ok(!CARGA_EMAIL.test("cliente@gmail.com"))
  assert.ok(!CARGA_EMAIL.test("szguisantos@gmail.com"))
})
