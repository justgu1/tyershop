const METHOD_LABEL: Record<string, string> = { card: "Cartão de crédito", pix: "Pix", boleto: "Boleto" }

export const methodLabel = (method?: string | null, fallback = "—") => (method ? METHOD_LABEL[method] ?? fallback : fallback)
