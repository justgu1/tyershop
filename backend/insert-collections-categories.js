const MEDUSA_URL = "http://localhost:9003"
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY3Rvcl9pZCI6InVzZXJfMDFLUEhZNU1ES0pFWDhaNzlXUUNHOEhGNkgiLCJhY3Rvcl90eXBlIjoidXNlciIsImF1dGhfaWRlbnRpdHlfaWQiOiJhdXRoaWRfMDFLUEhZNU1HQTBONURRSlkwVFhaNkZUVjciLCJhcHBfbWV0YWRhdGEiOnsidXNlcl9pZCI6InVzZXJfMDFLUEhZNU1ES0pFWDhaNzlXUUNHOEhGNkgiLCJyb2xlcyI6W119LCJ1c2VyX21ldGFkYXRhIjp7fSwiaWF0IjoxNzc2NTc2NDcyLCJleHAiOjE3NzY2NjI4NzJ9.wvCtwaCOa_Rc1yOCLnYgqosKKj5G9eOkGo4vxc2x75w"

const HEADERS = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${TOKEN}`
}

const COLLECTIONS = [
  "Tyer In Paris",
  "Five Stars Only",
  "Tyer Starter",
  "Savage Mode",
  "MVP",
  "Red Rose",
  "Tyer Tech",
  "Tyer Day",
]

const CATEGORIES = [
  { name: "Acessórios", children: ["Chaveiros", "Pulseiras"] },
  { name: "Camisetas", children: [] },
  { name: "Shorts", children: [] },
  { name: "Regatas", children: [] },
  { name: "Treino", children: [] },
  { name: "Jaquetas", children: [] },
]

async function main() {
  // Collections
  console.log("\n── Collections ──")
  for (const title of COLLECTIONS) {
    const handle = title.toLowerCase().replace(/\s+/g, "-").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    const res = await fetch(`${MEDUSA_URL}/admin/collections`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ title, handle })
    })
    const data = await res.json()
    if (res.ok) console.log(`✓ ${title} (${data.collection.id})`)
    else console.log(`✗ ${title} - ${data?.message || res.status}`)
  }

  // Categories
  console.log("\n── Categorias ──")
  for (const cat of CATEGORIES) {
    const res = await fetch(`${MEDUSA_URL}/admin/product-categories`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ name: cat.name, is_active: true, is_internal: false })
    })
    const data = await res.json()
    if (!res.ok) {
      console.log(`✗ ${cat.name} - ${data?.message || res.status}`)
      continue
    }
    console.log(`✓ ${cat.name} (${data.product_category.id})`)
    const parentId = data.product_category.id

    for (const child of cat.children) {
      const res2 = await fetch(`${MEDUSA_URL}/admin/product-categories`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ name: child, parent_category_id: parentId, is_active: true, is_internal: false })
      })
      const data2 = await res2.json()
      if (res2.ok) console.log(`  ✓ ${child} (${data2.product_category.id})`)
      else console.log(`  ✗ ${child} - ${data2?.message || res2.status}`)
    }
  }

  console.log("\nDone!")
}

main().catch(console.error)
