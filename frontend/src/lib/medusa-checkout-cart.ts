/**
 * Cria um carrinho no Medusa a partir do `tyer_cart` local (variantes + quantidades).
 * Preços e totais vêm do Medusa — não enviar `unit_price` do cliente para o gateway.
 */
import { getAppliedPromoCode, getCart, type CartItem } from './cart';

function publishableKey(): string {
  const k = import.meta.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY;
  return typeof k === 'string' && k.trim() ? k.trim() : '';
}

async function fetchRegionId(base: string, pk: string): Promise<string | null> {
  const r = await fetch(`${base}/store/regions?limit=1`, { headers: { 'x-publishable-api-key': pk } });
  const j = await r.json();
  return j?.regions?.[0]?.id ?? null;
}

export type MedusaCheckoutLine = { variantId: string; quantity: number };

/** Cria carrinho Medusa + linhas (preços definidos pelo Medusa). */
export async function createMedusaCartWithLines(lines: MedusaCheckoutLine[]): Promise<string> {
  if (!lines.length) throw new Error('Sem linhas');
  const pk = publishableKey();
  if (!pk) throw new Error('PUBLIC_MEDUSA_PUBLISHABLE_KEY não configurada');

  const base = '';
  const regionId = await fetchRegionId(base, pk);
  if (!regionId) throw new Error('Sem região Medusa');

  const created = await fetch(`${base}/store/carts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-publishable-api-key': pk },
    body: JSON.stringify({ region_id: regionId }),
  });
  const createdJson = await created.json();
  const cartId = createdJson?.cart?.id as string | undefined;
  if (!cartId) throw new Error('Falha ao criar carrinho Medusa');

  for (const line of lines) {
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const res = await fetch(`${base}/store/carts/${cartId}/line-items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-publishable-api-key': pk },
      body: JSON.stringify({ variant_id: line.variantId, quantity: qty }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Linha não adicionada: ${res.status} ${err}`);
    }
  }

  const code = getAppliedPromoCode();
  if (code) {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-publishable-api-key': pk };
    let applied: { cart?: unknown } | null = null;
    const pr = await fetch(`${base}/store/carts/${cartId}/promotions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ promo_codes: [code] }),
    });
    if (pr.ok) applied = await pr.json();
    else {
      const fb = await fetch(`${base}/store/carts/${cartId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ promo_codes: [code] }),
      });
      if (fb.ok) applied = await fb.json();
    }
    if (!applied?.cart) {
      /* cupom inválido: segue sem desconto */
    }
  }

  return cartId;
}

/** Carrinho local `tyer_cart` → Medusa. */
export async function createMedusaCartFromLocalCart(): Promise<string> {
  const items = getCart();
  if (!items.length) throw new Error('Carrinho vazio');
  const lines: MedusaCheckoutLine[] = (items as CartItem[]).map((i) => ({
    variantId: i.variantId,
    quantity: i.quantity,
  }));
  return createMedusaCartWithLines(lines);
}
