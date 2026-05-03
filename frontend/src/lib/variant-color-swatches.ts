/** Palavras-chave em títulos de opção (Medusa) tratadas como "cor" para swatch. */
const COLOR_OPTION_TITLE_RE = /^(cor|cores|color|colour|variante|tinta)$/i;

/** Normaliza texto para matching (sem acentos, minúsculas). */
function normKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

/** Mapa valor exibido → cor CSS (hex ou nome). Inclui PT/EN comuns. */
const COLOR_MAP: Record<string, string> = {
  // PT
  preto: '#0a0a0a',
  branco: '#f5f5f5',
  branca: '#f5f5f5',
  cinza: '#6b7280',
  chumbo: '#4b5563',
  grafite: '#374151',
  vermelho: '#dc2626',
  'vermelho escuro': '#991b1b',
  bordo: '#7f1d1d',
  vinho: '#722f37',
  rosa: '#ec4899',
  'rosa choque': '#db2777',
  pink: '#f472b6',
  azul: '#2563eb',
  'azul marinho': '#1e3a5f',
  navy: '#1e3a8a',
  celeste: '#38bdf8',
  turquesa: '#14b8a6',
  verde: '#16a34a',
  musgo: '#3f6212',
  oliva: '#65a30d',
  amarelo: '#eab308',
  dourado: '#ca8a04',
  laranja: '#ea580c',
  marrom: '#78350f',
  bege: '#d6c0a3',
  creme: '#faf5e6',
  offwhite: '#f0f0ea',
  off: '#f0f0ea',
  nude: '#c4a484',
  lilas: '#a78bfa',
  roxo: '#7c3aed',
  violeta: '#6d28d9',
  camelo: '#b45309',
  // EN
  black: '#0a0a0a',
  white: '#f5f5f5',
  gray: '#6b7280',
  grey: '#6b7280',
  red: '#dc2626',
  blue: '#2563eb',
  green: '#16a34a',
  yellow: '#eab308',
  orange: '#ea580c',
  purple: '#7c3aed',
};

export function isColorOptionRow(optionTitle: string): boolean {
  return COLOR_OPTION_TITLE_RE.test(String(optionTitle ?? '').trim());
}

/**
 * Cor de fundo para swatch a partir do valor da opção (ex.: "Vermelho Rose").
 * Usa match por palavra-chave no texto normalizado.
 */
export function cssColorForOptionValue(raw: string): string | null {
  const n = normKey(raw);
  if (!n) return null;
  if (COLOR_MAP[n]) return COLOR_MAP[n];
  for (const [word, hex] of Object.entries(COLOR_MAP)) {
    if (n.includes(word)) return hex;
  }
  if (n.includes('rose')) return '#fb7185';
  if (n.includes('burgundy') || n.includes('bordo')) return '#7f1d1d';
  return null;
}
