# Cloudflare na frente do tyershop.com — passo a passo

Contexto: site carregava vídeo/assets pesados direto do pod, sem cache/edge — lento. Este guia cobre só a parte que **precisa ser feita no painel da Cloudflare/Squarespace/VPS** (nenhuma dessas ações é executável por código neste repo). Ver também `k8s/NOTES.md`.

## O que já está resolvido (não precisa repetir)

- Vídeo hero: reduzido de 44MB pra ~8MB (webm) + ~18MB (mp4 fallback) — já commitado em `frontend/public/video/`.
- Bug de imagem de produto com URL morta (`AWS_URL` do Medusa apontando pra rota `/cdn` inexistente): **já corrigido** por outra sessão via repo `infra-k8s` — existe `IngressRoute`/`Middleware` (`minio-tyershop-cdn-tls`/`minio-cdn-strip`, namespace `shared`) roteando `https://api.homolog.tyershop.com/cdn/tyershop` → MinIO, bucket já público. Testado: `curl -I https://api.homolog.tyershop.com/cdn/tyershop/` → `200 OK`. **Não criar rota duplicada** (`cdn.tyershop.com` ou parecido) — reaproveitar esse padrão `/cdn` se algum dia precisar de um host de produção equivalente (`api.tyershop.com/cdn`), coordenando com quem mantém `infra-k8s`.

## 1. Conta + Zone na Cloudflare

1. Criar conta Cloudflare (Free plan cobre WAF managed básico, Cache Rules, TLS Full-strict — suficiente pro que precisamos).
2. "Add a site" → `tyershop.com`. A Cloudflare varre o DNS atual (Squarespace) automaticamente e importa os registros existentes.

## 2. Corte hitless (não derrubar o site atual)

Hoje `tyershop.com` resolve pra Squarespace (`185.133.35.22`) — a VPS nova (`167.88.44.4`) já tem rota pronta no Traefik (`k8s/ingressroute.yaml`, `Host(tyershop.com) || Host(www.tyershop.com)`), só falta o DNS apontar pra ela.

1. Conferir na Cloudflare que TODOS os registros importados (A/AAAA/CNAME/MX/TXT — o que hoje serve o site e e-mail) estão com proxy status **"DNS only"** (nuvem cinza) — isso não muda nada ainda, é só espelhar o que já existe.
2. Só depois de conferir, trocar os nameservers no painel da Squarespace pros nameservers que a Cloudflare fornecer (2 endereços tipo `xxx.ns.cloudflare.com`). Propagação leva até 24-48h; o site antigo continua no ar igual durante esse tempo porque os registros espelhados respondem do mesmo jeito.
3. Com a zone ativa (Cloudflare avisa por e-mail/painel quando os NS propagaram), criar/ajustar os registros que vão apontar pro site novo:
   - `A tyershop.com → 167.88.44.4` (proxied, nuvem laranja)
   - `A www.tyershop.com → 167.88.44.4` (proxied) — ou `CNAME www → tyershop.com`
   Esse é o momento real de corte — fazer fora de horário de pico. Confirmar que `https://tyershop.com` carrega o site novo (não mais Squarespace) antes de seguir pros próximos passos.

## 3. SSL/TLS

- SSL/TLS → Overview: modo **Full (strict)** — o Traefik já tem certificado válido via ACME (`certResolver: letsencrypt` em `k8s/ingressroute.yaml`), então dá pra exigir cert válido ponta a ponta sem downgrade pra "Full" solto.
- SSL/TLS → Edge Certificates: ativar **"Always Use HTTPS"**, TLS mínimo **1.2**.

## 4. Esconder o IP real da VPS

No firewall da VPS (ufw/iptables ou security group), liberar HTTP/HTTPS **só** pros ranges de IP da Cloudflare:
```
curl -s https://www.cloudflare.com/ips-v4
curl -s https://www.cloudflare.com/ips-v6
```
Qualquer IP fora dessas listas deve ser bloqueado nas portas 80/443. Sem isso, alguém que descobrir o IP real (histórico de DNS, certificado antigo, etc.) contorna o CDN/WAF direto na origem.

## 5. WAF + Bot

- Security → WAF: ativar **Managed Rules** (Cloudflare Managed Ruleset — já incluso no Free).
- Security → Bots: ativar **Bot Fight Mode**.

## 6. Rate limiting

Security → WAF → Rate limiting rules:
- `medusa.tyershop.com/admin*` ou equivalente (painel Medusa): ~20 req/min por IP.
- `/api/create-checkout`, `/store/carts*` (rotas de carrinho/checkout no gateway `api`): limite mais baixo, pra coibir abuso automatizado.
- Assets estáticos (`/video/*`, `*.webp`, `*.avif`, `/icons/*`, e o caminho `/cdn/*` do MinIO): limite alto (ex. 600/min), só como proteção anti-scraping — não são rotas sensíveis.

## 7. Cache Rules (Rules → Cache Rules — engine novo, substitui Page Rules legado)

- Regra 1 — path `/video/*` OR `*.webp` OR `*.avif` OR `*.svg` OR `/icons/*` OR `/cdn/*` → **Cache Everything**, Edge TTL 7 dias, Browser TTL 1 dia. (Sem hash no nome do arquivo hoje — se no futuro adotar nomes versionados/com hash, subir Edge TTL pra 1 ano e marcar `immutable`.)
- Regra 2 — `/store/*`, `/admin*`, `/api/*` → **Bypass cache** (rotas dinâmicas: carrinho, checkout, admin, sessão).
- Confirmar que o restante do HTML das páginas (`/`, `/product/*`, etc., que são SSR) também fica de fora do cache agressivo — Cache Level padrão da Cloudflare (Standard) já respeita isso sem regra extra, mas vale conferir depois do corte que a home não fica presa em cache velho (usar "Purge Cache" no painel se precisar forçar atualização depois de um deploy).

## Checklist de verificação

- [ ] `dig tyershop.com` aponta pros nameservers da Cloudflare (depois do corte).
- [ ] `curl -I https://tyershop.com` → carrega o site novo, `server: cloudflare` no header.
- [ ] `curl -I https://tyershop.com/video/hero.webm` (ou outro asset estático) 2x seguidas → segunda chamada com `cf-cache-status: HIT`.
- [ ] Acesso direto a `http://167.88.44.4` (sem passar pela Cloudflare) falha/timeout depois do firewall restrito.
- [ ] `curl -I https://api.homolog.tyershop.com/cdn/tyershop/` continua `200 OK` (garantir que nada no corte de DNS afetou o `/cdn` já funcionando).
- [ ] Lighthouse/PageSpeed Insights antes/depois — LCP do hero deve cair bastante com o vídeo menor + cache de edge.
