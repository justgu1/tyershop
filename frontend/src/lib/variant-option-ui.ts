/** Heurística para UI do ProductCard (Medusa option rows). */

export type OptionRowKind = 'color' | 'size' | 'other';

const COLOR_KEYS = /\b(cor|color|colour|cores)\b/i;
const SIZE_KEYS = /\b(tamanho|size|tam\.?|medida)\b/i;

export function optionRowKind(title: string): OptionRowKind {
  const t = String(title ?? '').trim();
  if (!t) return 'other';
  if (COLOR_KEYS.test(t)) return 'color';
  if (SIZE_KEYS.test(t)) return 'size';
  return 'other';
}

/** Rótulo curto para a linha (ex.: "Cor", "Tamanho") a partir do título da opção. */
export function optionRowShortLabel(title: string, kind: OptionRowKind): string {
  const raw = String(title ?? '').trim();
  if (kind === 'color') return 'Cor';
  if (kind === 'size') return 'Tamanho';
  if (!raw) return 'Opção';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/**
 * Mapa nome de cor (PT/EN, feminino/masculino) → hex.
 * Valores desconhecidos: null (UI usa cinza neutro).
 */
const COLOR_MAP: Record<string, string> = {
  preto: '#1a1a1a',
  preta: '#1a1a1a',
  black: '#1a1a1a',
  branco: '#f5f5f5',
  branca: '#f5f5f5',
  white: '#f5f5f5',
  off: '#f0f0f0',
  'off-white': '#f0f0f0',
  cinza: '#9ca3af',
  cinzaescuro: '#4b5563',
  'cinza escuro': '#4b5563',
  grey: '#9ca3af',
  gray: '#9ca3af',
  amarelo: '#eab308',
  amarela: '#eab308',
  yellow: '#eab308',
  dourado: '#ca8a04',
  dourada: '#ca8a04',
  gold: '#ca8a04',
  vermelho: '#dc2626',
  vermelha: '#dc2626',
  red: '#dc2626',
  bordô: '#7f1d1d',
  bordo: '#7f1d1d',
  azul: '#2563eb',
  'azul marinho': '#1e3a8a',
  navy: '#1e3a8a',
  blue: '#2563eb',
  verde: '#16a34a',
  verdeescuro: '#14532d',
  'verde escuro': '#14532d',
  green: '#16a34a',
  rosa: '#ec4899',
  pink: '#ec4899',
  lilás: '#a855f7',
  lilas: '#a855f7',
  roxo: '#7c3aed',
  purple: '#7c3aed',
  laranja: '#ea580c',
  orange: '#ea580c',
  bege: '#d6c4a8',
  beige: '#d6c4a8',
  creme: '#faf5eb',
  cream: '#faf5eb',
  marrom: '#78350f',
  brown: '#78350f',
  caramelo: '#a16207',
  camelo: '#a16207',
  terracota: '#c2410c',
  nude: '#e8d5c4',
};

function normalizeColorKey(val: string): string {
  return val
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cor de preenchimento do swatch; `null` = neutro. `isGradient` só para multicolor. */
const MULTI_GRADIENT = 'linear-gradient(135deg,#ef4444,#eab308,#22c55e,#3b82f6)';

/** Ordem fixa para opções de tamanho (PT comum). Valores não listados vão ao fim, por ordem alfabética. */
const SIZE_ORDER = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'];

function normalizeSizeToken(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\./g, '');
}

export function sortSizeOptionValues(values: string[]): string[] {
  if (!Array.isArray(values) || values.length < 2) return [...(values ?? [])];
  const rank = (v: string) => {
    const k = normalizeSizeToken(v);
    let idx = SIZE_ORDER.indexOf(k);
    if (idx >= 0) return idx;
    if (k === 'PPE' || k === 'XXXS') return -0.5;
    if (k === 'PE' || k === 'XS' || k === 'XP') return 0.25;
    if (k === 'G1') return 4.1;
    if (k === 'G2') return 4.9;
    if (k === 'EG' || k === '2GG' || k === '2XG') return 5.1;
    if (k === 'XXL' || k === '2XL') return 5.2;
    if (k === 'XXXL' || k === '3XL' || k === '3XG') return 5.3;
    return 1000;
  };
  return [...values].sort((a, b) => {
    const d = rank(a) - rank(b);
    return d !== 0 ? d : normalizeSizeToken(a).localeCompare(normalizeSizeToken(b));
  });
}

export function swatchFillForValue(val: string): { fill: string | null; isGradient: boolean } {
  const key = normalizeColorKey(val);
  if (!key) return { fill: null, isGradient: false };
  if (/\b(multi|estampa|print|misto)\b/i.test(key)) {
    return { fill: MULTI_GRADIENT, isGradient: true };
  }
  const direct = COLOR_MAP[key.replace(/\s/g, '')] ?? COLOR_MAP[key];
  if (direct) return { fill: direct, isGradient: false };
  const collapsed = key.replace(/\s/g, '');
  const fromCollapsed = COLOR_MAP[collapsed];
  if (fromCollapsed) return { fill: fromCollapsed, isGradient: false };
  return { fill: null, isGradient: false };
}
