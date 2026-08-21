# Notas do deploy k8s

- **frontend**: a imagem publicada (`ghcr.io/justgu1/tyershop-frontend`) serve via nginx estático (stage `prod` do Dockerfile). As rotas `/product/[handle]` e `/collections/[handle]` são SSR sob demanda (`prerender = false`) e **vão quebrar** — nginx não roda o adapter Node. Pra funcionar de verdade precisa trocar o Dockerfile pra rodar `node dist/server/entry.mjs` (porta 4321) em vez de nginx, ou usar outro target.
- **`PUBLIC_*` do frontend são build-time** (embutidos no bundle Astro no `astro build` do CI). As env vars setadas no Deployment (`PUBLIC_MEDUSA_URL`, `PUBLIC_API_URL` etc.) **não têm efeito** no client já compilado — só valem se reconstruir a imagem com esses valores como build args.
- `PUBLIC_MEDUSA_PUBLISHABLE_KEY` e `PUBLIC_MEDUSA_REGION_ID` só existem depois de o backend Medusa subir e alguém criar a publishable key + região pelo painel admin (`medusa.hg.tyershop.com`) — estão `CHANGEME` até lá.
- `MERCADOPAGO_ACCESS_TOKEN`, `PUBLIC_MERCADOPAGO_PUBLIC_KEY`, `SMTP_HOST` e afins: `CHANGEME`, precisam do valor real.
- Redis: usuário ACL `tyershop` ficou **sem restrição de prefixo** (`~*`), diferente do padrão do resto do shared — Medusa não expõe opção de prefixar chaves nativamente, então restringir a `tyershop_*` quebraria a aplicação.
- Domínios usados: `hg.tyershop.com` (frontend), `medusa.hg.tyershop.com` (backend/admin), `api.hg.tyershop.com` (serviço de pagamento/email) — os 2 últimos são novos, precisam de DNS.
