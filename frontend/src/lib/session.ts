const COOKIE = 'tyer_token';

/** Token da conta lido do cookie que o browser manda ao SSR (espelho do localStorage). */
export function readSessionToken(cookieHeader: string | null | undefined): string {
  if (!cookieHeader) return '';
  const hit = cookieHeader.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : '';
}

/**
 * O login guarda o token só no localStorage, que o servidor não enxerga. Esta
 * função espelha o token num cookie e devolve true quando mudou algo (a página
 * precisa recarregar uma vez para o SSR ver a sessão).
 */
export function syncSessionCookie(): boolean {
  let token = '';
  try {
    token = localStorage.getItem('tyer_token') || '';
  } catch {
    return false;
  }
  const current = readSessionToken(document.cookie);
  if (token === current) return false;
  document.cookie = token
    ? `${COOKIE}=${encodeURIComponent(token)}; path=/; max-age=86400; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    : `${COOKIE}=; path=/; max-age=0; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  return true;
}
