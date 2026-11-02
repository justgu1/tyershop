import { syncSessionCookie } from '../lib/session';

// O SSR só enxerga a sessão pelo cookie. Espelhar o token em todas as páginas faz o link "Ver o drop" já chegar com o acesso conferido.
syncSessionCookie();
window.addEventListener('tyer:auth', () => {
  syncSessionCookie();
});
