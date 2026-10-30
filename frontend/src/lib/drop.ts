import { getMedusaStoreUrl, getPublishableKey } from './medusa-env';

export type DropPhase = 'coming_soon' | 'presale' | 'general' | 'ended';

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

export type DropPayload = { drop: PublicDrop | null; previous: PublicDrop[] };

const EMPTY: DropPayload = { drop: null, previous: [] };

export async function fetchDrops(): Promise<DropPayload> {
  try {
    const res = await fetch(`${getMedusaStoreUrl()}/store/drop`, {
      headers: { 'x-publishable-api-key': getPublishableKey() },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return EMPTY;
    const data = await res.json();
    return { drop: data.drop ?? null, previous: data.previous ?? [] };
  } catch {
    return EMPTY;
  }
}

export const PHASE_LABEL: Record<DropPhase, string> = {
  coming_soon: 'Em breve',
  presale: 'Pré-venda',
  general: 'Venda geral',
  ended: 'Encerrado',
};
