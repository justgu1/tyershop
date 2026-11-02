import { getMedusaStoreUrl, getPublishableKey } from './medusa-env';
import { cached } from './ssr-cache';
import { getProductListQueryString, resolveDefaultRegionId } from './medusa-pricing';

export type DropPhase = 'coming_soon' | 'presale' | 'general' | 'ended';

/** granted: pode ver e comprar · login: pré-venda sem sessão · locked: logado sem convite · none: fora de venda */
export type DropAccess = 'granted' | 'login' | 'locked' | 'none';

export type PublicDrop = {
  id: string;
  handle: string;
  title: string;
  subtitle: string | null;
  phase: DropPhase;
  next_phase_at: string | null;
  preorder_starts_at: string;
  preorder_ends_at: string;
  general_starts_at: string | null;
  general_ends_at: string;
  production_days: number;
  component_key: string | null;
  hero_kind: 'community_video' | 'drop_video' | 'banner';
  hero_url: string | null;
  cover_url: string | null;
  instagram_url: string | null;
  whatsapp_url: string | null;
};

export type DropPayload = {
  drop: PublicDrop | null;
  previous: PublicDrop[];
  access: DropAccess;
  product_ids: string[];
};

const EMPTY: DropPayload = { drop: null, previous: [], access: 'none', product_ids: [] };

export async function fetchDrops(token?: string): Promise<DropPayload> {
  // Sem conta o resultado é igual para todos: vale guardar por alguns segundos (a fase muda por data, e o cronômetro recarrega a página).
  if (!token) return cached('drops:anon', 10_000, () => fetchDropsUncached(), (v) => v !== EMPTY);
  return fetchDropsUncached(token);
}

async function fetchDropsUncached(token?: string): Promise<DropPayload> {
  try {
    const res = await fetch(`${getMedusaStoreUrl()}/store/drop`, {
      headers: {
        'x-publishable-api-key': getPublishableKey(),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return EMPTY;
    const data = await res.json();
    return {
      drop: data.drop ?? null,
      previous: data.previous ?? [],
      access: data.access ?? 'none',
      product_ids: data.product_ids ?? [],
    };
  } catch {
    return EMPTY;
  }
}

/** Produtos completos (preço, variantes, estoque) na ordem em que foram pedidos. */
export async function fetchProductsByIds(ids: string[], token?: string): Promise<any[]> {
  if (!ids.length) return [];
  try {
    const url = getMedusaStoreUrl();
    const headers: Record<string, string> = {
      'x-publishable-api-key': getPublishableKey(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
    const regionId = await resolveDefaultRegionId(url, headers);
    const query = `${ids.map((id) => `id[]=${encodeURIComponent(id)}`).join('&')}&${getProductListQueryString(regionId)}&limit=${ids.length}`;
    const res = await fetch(`${url}/store/products?${query}`, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const { products = [] } = await res.json();
    const byId = new Map<string, any>(products.map((p: any) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  } catch {
    return [];
  }
}

/** Linha fixa Starter, na ordem do catálogo: sempre à venda (esgotado aparece como esgotado). */
const STARTER_HANDLES = ['regata-savage-mode', 'shorts-tyer-pro', 'camiseta-tyer-starter-dry-fit', 'pulseira-tyer'];

export async function fetchStarterProducts(): Promise<any[]> {
  return cached('starter', 30_000, () => fetchStarterUncached(), (v) => v.length > 0);
}

async function fetchStarterUncached(): Promise<any[]> {
  try {
    const url = getMedusaStoreUrl();
    const headers = { 'x-publishable-api-key': getPublishableKey() };
    const regionId = await resolveDefaultRegionId(url, headers);
    const handles = STARTER_HANDLES.map((h) => `handle[]=${encodeURIComponent(h)}`).join('&');
    const query = `${handles}&${getProductListQueryString(regionId)}&limit=${STARTER_HANDLES.length}`;
    const res = await fetch(`${url}/store/products?${query}`, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const { products = [] } = await res.json();
    const byHandle = new Map<string, any>(products.map((p: any) => [p.handle, p]));
    return STARTER_HANDLES.map((h) => byHandle.get(h)).filter(Boolean);
  } catch {
    return [];
  }
}

export const PHASE_LABEL: Record<DropPhase, string> = {
  coming_soon: 'Em breve',
  presale: 'Pré-venda',
  general: 'Venda geral',
  ended: 'Encerrado',
};

/** Alvo, rótulo e CTA do cronômetro de cada fase; `target` é null quando não há contagem. */
export function dropCountdown(drop: PublicDrop) {
  const target =
    drop.phase === 'coming_soon'
      ? drop.preorder_starts_at
      : drop.phase === 'presale'
        ? (drop.general_starts_at ?? drop.preorder_ends_at)
        : drop.phase === 'general'
          ? drop.general_ends_at
          : null;
  const label = { coming_soon: 'Pré-venda abre em', presale: 'Pré-venda termina em', general: 'Venda geral termina em', ended: '' }[drop.phase];
  const cta = drop.phase === 'ended' ? 'Entrar na lista do próximo' : drop.phase === 'coming_soon' ? 'Quero ser avisado' : 'Ver o drop';
  return { target, label, cta };
}
