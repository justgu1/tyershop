const MEDUSA_URL = "http://localhost:9003"
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY3Rvcl9pZCI6InVzZXJfMDFLUEhZNU1ES0pFWDhaNzlXUUNHOEhGNkgiLCJhY3Rvcl90eXBlIjoidXNlciIsImF1dGhfaWRlbnRpdHlfaWQiOiJhdXRoaWRfMDFLUEhZNU1HQTBONURRSlkwVFhaNkZUVjciLCJhcHBfbWV0YWRhdGEiOnsidXNlcl9pZCI6InVzZXJfMDFLUEhZNU1ES0pFWDhaNzlXUUNHOEhGNkgiLCJyb2xlcyI6W119LCJ1c2VyX21ldGFkYXRhIjp7fSwiaWF0IjoxNzc2NTc2NDcyLCJleHAiOjE3NzY2NjI4NzJ9.wvCtwaCOa_Rc1yOCLnYgqosKKj5G9eOkGo4vxc2x75w"

const HEADERS = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${TOKEN}`
}

const TO_DELETE = [
  "prod_01KPJ64QH00Z25S53T1HQ9Z5PJ",
  "prod_01KPJ64QH01NR9375T4CMMSJEG",
  "prod_01KPJ64QH0330ZKJYC72BJNNEC",
  "prod_01KPJ64QH06V32JDGPYAKRYYQK",
  "prod_01KPJ64QH0KXZ436TQ5VT37R1H",
  "prod_01KPJ64QH0Q4RNQB8VWB7F1AB1",
  "prod_01KPJ64QH0QYTGH6FR5V7Z4HAK",
  "prod_01KPJ64QH0VSQADNZZY5DVNT4G",
  "prod_01KPJ64QH0VYAD3EHE2D2TE1YQ",
  "prod_01KPJ64QH10Q7V6C7HZ53ZTMPG",
  "prod_01KPJ64QH11TMZZAWZTA5D86W1",
  "prod_01KPJ64QH144XQYFRKTXSSGYQ6",
  "prod_01KPJ64QH17NJKXFN27C64467Z",
  "prod_01KPJ64QH1AC2EZJBRMAW7YAFS",
  "prod_01KPJ64QH1AK9WXZGZD6P0CNKP",
  "prod_01KPJ64QH1JNH747G1E4PVBNB4",
  "prod_01KPJ64QH1M6KYDKHN5R7P0NVS",
  "prod_01KPJ64QH1MT2V80WZ6QSVESH5",
  "prod_01KPJ64QH1RZFK7WN07KD6CR3P",
  "prod_01KPJ64QH1ZRT77VRQ4KPW3NHP",
  "prod_01KPJ64QH21FRW9FQ6KFKE565T",
  "prod_01KPJ64QH2248FWCJ0CK6D4ST4",
  "prod_01KPJ64QH2Y4TT85PPX9TMRMGE",
  "prod_01KPJ64QH2ZZPX3F33X1GED0Q4",
]

async function main() {
  let ok = 0, fail = 0
  for (const id of TO_DELETE) {
    const res = await fetch(`${MEDUSA_URL}/admin/products/${id}`, {
      method: "DELETE",
      headers: HEADERS,
    })
    if (res.ok) {
      console.log(`✓ ${id}`)
      ok++
    } else {
      const data = await res.json()
      console.log(`✗ ${id} - ${data?.message || res.status}`)
      fail++
    }
  }
  console.log(`\nDone! ${ok} deletados, ${fail} falhas.`)
}

main().catch(console.error)