// Rodar com: node insert-tags.js
// Requer: npm install node-fetch (ou Node 18+ que já tem fetch nativo)

const MEDUSA_URL = "http://localhost:9003"
const MEDUSA_EMAIL = "szguisantos@gmail.com"       // ← troca aqui
const MEDUSA_PASSWORD = "password"          // ← troca aqui

const TAGS = [
  "algodao", "basic", "basketball", "basquete", "blusa", "blusa de frio",
  "camisa de basquete", "camiseta", "camiseta boxy", "camiseta de algodao",
  "camiseta dri fit", "camiseta five stars", "camiseta five stars only",
  "camiseta red rose", "camisete basic", "chaveiro", "chaveiro five stars only",
  "chaveiro tyer", "cinco estrelas", "colecionador", "conforto", "drifit",
  "drop 1", "drop1", "exclusivo", "five stars", "five stars only", "fleece",
  "franca", "hooper", "jaqueta", "jaqueta esportiva", "logo",
  "most valuable player", "mvp", "paris", "pulseira", "pulseira de basquete",
  "pulseira de silicone", "red rose", "regata", "regular", "roupas de basquete",
  "rr", "savage", "savage mode", "short hooper", "shorts", "shorts basic",
  "shorts cinco estrelas", "shorts five stars", "shorts franca", "shorts red rose",
  "shorts regular", "shorts tyer", "shots hooper", "streetwear", "tech", "tyer",
  "tyer basketball", "tyer boy", "tyer day", "tyer in paris", "tyer logo",
  "tyer pro", "tyer tech"
]

async function main() {
  // Login
  const loginRes = await fetch(`${MEDUSA_URL}/auth/user/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: MEDUSA_EMAIL, password: MEDUSA_PASSWORD })
  })
  const { token } = await loginRes.json()
  if (!token) {
    console.error("Login falhou. Verifique email e senha.")
    process.exit(1)
  }
  console.log("Login OK")

  // Insert tags one by one
  let ok = 0, fail = 0
  for (const value of TAGS) {
    const res = await fetch(`${MEDUSA_URL}/admin/product-tags`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ value })
    })
    if (res.ok) {
      console.log(`✓ ${value}`)
      ok++
    } else {
      const err = await res.json()
      console.log(`✗ ${value} - ${err?.message || res.status}`)
      fail++
    }
  }

  console.log(`\nDone! ${ok} inseridas, ${fail} falhas.`)
}

main().catch(console.error)
