const MEDUSA_URL = "http://localhost:9003"
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY3Rvcl9pZCI6InVzZXJfMDFLUEhZNU1ES0pFWDhaNzlXUUNHOEhGNkgiLCJhY3Rvcl90eXBlIjoidXNlciIsImF1dGhfaWRlbnRpdHlfaWQiOiJhdXRoaWRfMDFLUEhZNU1HQTBONURRSlkwVFhaNkZUVjciLCJhcHBfbWV0YWRhdGEiOnsidXNlcl9pZCI6InVzZXJfMDFLUEhZNU1ES0pFWDhaNzlXUUNHOEhGNkgiLCJyb2xlcyI6W119LCJ1c2VyX21ldGFkYXRhIjp7fSwiaWF0IjoxNzc2NTc2NDcyLCJleHAiOjE3NzY2NjI4NzJ9.wvCtwaCOa_Rc1yOCLnYgqosKKj5G9eOkGo4vxc2x75w"

const HEADERS = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${TOKEN}`
}

// handle -> category IDs
const HANDLE_CATEGORIES = {
  "shorts-tyer-day-2k25-mbqip":           ["pcat_01KPJ5P3ECEJF6S49230P4KGAZ"],
  "shorts-tyer-in-paris":                 ["pcat_01KPJ5P3ECEJF6S49230P4KGAZ"],
  "camiseta-tyer-in-paris-boxy":          ["pcat_01KPJ5P3CV89RSC46ZM5025586"],
  "treino-de-ferias-3-0-summer-edition":  ["pcat_01KPJ5P3HGYEB9Y0ZTQX06VC92"],
  "chaveiro-tyer-five-stars-only":        ["pcat_01KPJ5P3AFKHV8CSA9VQ7E58ES", "pcat_01KPJ5P38MA8T0S96T6XGWSE4V"],
  "chaveiro-tyer-boy":                    ["pcat_01KPJ5P3AFKHV8CSA9VQ7E58ES", "pcat_01KPJ5P38MA8T0S96T6XGWSE4V"],
  "chaveiro-tyer-logo":                   ["pcat_01KPJ5P3AFKHV8CSA9VQ7E58ES", "pcat_01KPJ5P38MA8T0S96T6XGWSE4V"],
  "camiseta-tyer-five-stars-amarela":     ["pcat_01KPJ5P3CV89RSC46ZM5025586"],
  "camiseta-tyer-five-stars-preta":       ["pcat_01KPJ5P3CV89RSC46ZM5025586"],
  "shorts-tyer-five-stars-amarelo":       ["pcat_01KPJ5P3ECEJF6S49230P4KGAZ"],
  "shorts-tyer-five-stars-preto":         ["pcat_01KPJ5P3ECEJF6S49230P4KGAZ"],
  "shorts-tyer-pro":                      ["pcat_01KPJ5P3ECEJF6S49230P4KGAZ"],
  "tyer-savage-mode-2-dry-fit":           ["pcat_01KPJ5P3CV89RSC46ZM5025586"],
  "regata-savage-mode-preta":             ["pcat_01KPJ5P3G33PY1B4ZC6DQVBBFC"],
  "regata-savage-mode-branca":            ["pcat_01KPJ5P3G33PY1B4ZC6DQVBBFC"],
  "tyertech":                             ["pcat_01KPJ5P3JSA8SQAVF4E4YWNRC1"],
  "pulseira-tyer":                        ["pcat_01KPJ5P3BT7P2GR0T47Y2PH77S", "pcat_01KPJ5P38MA8T0S96T6XGWSE4V"],
  "camiseta-tyer-starter-dry-fit":        ["pcat_01KPJ5P3CV89RSC46ZM5025586"],
  "shorts-tyer-starter-dry-fit":          ["pcat_01KPJ5P3ECEJF6S49230P4KGAZ"],
  "shorts-tyer-red-rose-dry-fit":         ["pcat_01KPJ5P3ECEJF6S49230P4KGAZ"],
  "camiseta-tyer-red-rose-vermelha":      ["pcat_01KPJ5P3CV89RSC46ZM5025586"],
  "camiseta-tyer-red-rose-preta":         ["pcat_01KPJ5P3CV89RSC46ZM5025586"],
  "mvp1":                                 ["pcat_01KPJ5P3CV89RSC46ZM5025586"],
  "tyer-savage-mode-1-dry-fit":           ["pcat_01KPJ5P3CV89RSC46ZM5025586"],
}

async function main() {
  // Fetch all products to get handle -> id map
  const res = await fetch(`${MEDUSA_URL}/admin/products?limit=1000&fields=id,handle`, { headers: HEADERS })
  const { products } = await res.json()
  const handleToId = {}
  for (const p of products) handleToId[p.handle] = p.id

  let ok = 0, fail = 0
  for (const [handle, catIds] of Object.entries(HANDLE_CATEGORIES)) {
    const productId = handleToId[handle]
    if (!productId) {
      console.log(`✗ produto não encontrado: ${handle}`)
      fail++
      continue
    }

    const res2 = await fetch(`${MEDUSA_URL}/admin/products/${productId}`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ categories: catIds.map(id => ({ id })) })
    })

    if (res2.ok) {
      console.log(`✓ ${handle} → ${catIds.join(', ')}`)
      ok++
    } else {
      const data = await res2.json()
      console.log(`✗ ${handle} - ${data?.message || res2.status}`)
      fail++
    }
  }

  console.log(`\nDone! ${ok} associados, ${fail} falhas.`)
}

main().catch(console.error)
