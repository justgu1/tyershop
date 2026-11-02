/** Cotação de frete (Melhor Envio) pelo backend: preço e prazo por serviço, com a escolha guardada entre páginas. */

export type ShipOption = { id: string; name: string; company: string; price: number; delivery_min: number; delivery_max: number };
export type ShipQuote = { options: ShipOption[]; production_days: number };
export type ShipLine = { variant_id: string; quantity: number };

const SAVED_KEY = 'tyer_shipping';
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatBrl = (v: number) => BRL.format(v);
export const onlyDigits = (v: string) => v.replace(/\D/g, '');
export const isCep = (v: string) => onlyDigits(v).length === 8;

export async function fetchShippingQuote(cep: string, lines: ShipLine[]): Promise<ShipQuote> {
  const pk = typeof window !== 'undefined' ? ((window as any).__MEDUSA_PK__ as string) || '' : '';
  const res = await fetch('/store/shipping/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-publishable-api-key': pk },
    body: JSON.stringify({ postal_code: cep, items: lines }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || 'Não foi possível calcular o frete agora.');
  return { options: data.options ?? [], production_days: Number(data.production_days) || 0 };
}

/** "6 a 8 dias úteis"; com produção: "Produção em até 21 dias + 6 a 8 dias úteis". */
export function deadlineText(o: ShipOption, productionDays: number) {
  const range = o.delivery_min && o.delivery_min !== o.delivery_max ? `${o.delivery_min} a ${o.delivery_max}` : `${o.delivery_max}`;
  const ship = `${range} dias úteis`;
  return productionDays > 0 ? `Produção em até ${productionDays} dias + ${ship}` : ship;
}

export const linesSignature = (lines: ShipLine[]) =>
  [...lines].sort((a, b) => a.variant_id.localeCompare(b.variant_id)).map((l) => `${l.variant_id}:${l.quantity}`).join('|');

export type SavedShipping = { cep: string; id: string; name: string; price: number; signature: string };

export function readSavedShipping(): SavedShipping | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
    return raw && typeof raw.cep === 'string' && typeof raw.id === 'string' ? raw : null;
  } catch {
    return null;
  }
}

export function saveShipping(s: SavedShipping | null) {
  try {
    if (s) localStorage.setItem(SAVED_KEY, JSON.stringify(s));
    else localStorage.removeItem(SAVED_KEY);
    if (s) localStorage.setItem('tyer_last_cep', s.cep);
  } catch {
    /* storage indisponível: só não lembra a escolha */
  }
}

/** Lista as opções com DOM (sem innerHTML). Com `onSelect`, vira uma lista de escolha única. */
export function renderShippingOptions(
  list: HTMLElement,
  quote: ShipQuote,
  opts: { selectedId?: string; onSelect?: (o: ShipOption) => void; name?: string } = {}
) {
  list.replaceChildren();
  if (!quote.options.length) {
    const p = document.createElement('p');
    p.className = 'ship-opts__empty';
    p.textContent = 'Nenhum serviço de entrega atende este CEP.';
    list.appendChild(p);
    return;
  }
  const group = opts.name || `ship-${Math.random().toString(36).slice(2, 7)}`;
  for (const o of quote.options) {
    const li = document.createElement('label');
    li.className = 'ship-opts__item';
    if (opts.onSelect) {
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = group;
      input.value = o.id;
      input.checked = o.id === opts.selectedId;
      input.addEventListener('change', () => opts.onSelect!(o));
      li.appendChild(input);
    }
    const text = document.createElement('span');
    text.className = 'ship-opts__text';
    const title = document.createElement('strong');
    title.textContent = o.name;
    const sub = document.createElement('small');
    sub.textContent = deadlineText(o, quote.production_days);
    text.append(title, sub);
    const price = document.createElement('span');
    price.className = 'ship-opts__price';
    price.textContent = formatBrl(o.price);
    li.append(text, price);
    list.appendChild(li);
  }
}
