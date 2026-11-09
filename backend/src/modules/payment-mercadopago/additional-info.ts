export type AntifraudCart = {
  items?: Array<{ product_id?: string | null; title?: string | null; variant_title?: string | null; quantity?: number | null; unit_price?: number | string | null }>;
  shipping_address?: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    postal_code?: string | null;
    address_1?: string | null;
    city?: string | null;
    province?: string | null;
  } | null;
};

/** Categoria única de todos os itens (vestuário): o Mercado Pago usa o campo na análise de risco. */
export const ITEM_CATEGORY_ID = "fashion"

const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");

/** "Rua X, 123" → rua e número; sem número reconhecível, a linha inteira vira a rua. */
function splitStreet(line?: string | null) {
  const m = /^(.*?)[,\s]+(\d+\w*)\s*$/.exec((line ?? "").trim());
  return m ? { street_name: m[1].trim(), street_number: m[2] } : { street_name: (line ?? "").trim(), street_number: undefined };
}

/** Produto e variante (ex.: tamanho), no limite de 256 caracteres do Mercado Pago. */
export function itemDescription(title: string, variantTitle?: string | null) {
  const variant = (variantTitle ?? "").trim()
  return (variant && variant !== title ? `${title} - ${variant}` : title).slice(0, 256)
}

/** Dados que o antifraude do Mercado Pago usa para pontuar o risco; campo vazio fica de fora. */
export function buildAdditionalInfo(cart: AntifraudCart | null, payer: { firstName?: string; lastName?: string }) {
  if (!cart) return undefined;
  const items = (cart.items ?? [])
    .filter((i) => i.title && Number(i.unit_price) > 0)
    .map((i) => ({
      id: i.product_id ?? undefined,
      title: String(i.title),
      description: itemDescription(String(i.title), i.variant_title),
      category_id: ITEM_CATEGORY_ID,
      quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
      unit_price: Math.round(Number(i.unit_price) * 100) / 100,
    }));
  const addr = cart.shipping_address;
  const phone = digits(addr?.phone).replace(/^55/, "");
  const street = splitStreet(addr?.address_1);

  const info: Record<string, unknown> = {
    items: items.length ? items : undefined,
    payer: {
      first_name: payer.firstName || addr?.first_name || undefined,
      last_name: payer.lastName || addr?.last_name || undefined,
      phone: phone.length >= 10 ? { area_code: phone.slice(0, 2), number: phone.slice(2) } : undefined,
    },
    shipments: addr
      ? {
          receiver_address: {
            zip_code: digits(addr.postal_code) || undefined,
            state_name: addr.province || undefined,
            city_name: addr.city || undefined,
            ...street,
          },
        }
      : undefined,
  };
  return JSON.parse(JSON.stringify(info));
}
