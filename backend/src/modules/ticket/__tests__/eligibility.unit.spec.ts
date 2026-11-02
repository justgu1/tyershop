import { leadsToIssue, ticketsToSend } from "../eligibility"

const lead = (id: string, status: string) => ({ id, status })

describe("leadsToIssue", () => {
  const leads = [
    lead("a", "liberado"),
    lead("b", "pendente"),
    lead("c", "inativo"),
    lead("d", "negado"),
    lead("e", "liberado"),
  ]

  it("picks only liberados", () => {
    expect(leadsToIssue(leads, []).map((l) => l.id)).toEqual(["a", "e"])
  })

  it("skips leads that already have a ticket for the drop", () => {
    expect(leadsToIssue(leads, [{ lead_id: "a" }]).map((l) => l.id)).toEqual(["e"])
  })
})

describe("ticketsToSend", () => {
  it("returns tickets whose email was not sent yet", () => {
    const tickets = [
      { lead_id: "a", sent_at: null },
      { lead_id: "b", sent_at: new Date() },
      { lead_id: "c" },
    ]
    expect(ticketsToSend(tickets).map((t) => t.lead_id)).toEqual(["a", "c"])
  })
})
