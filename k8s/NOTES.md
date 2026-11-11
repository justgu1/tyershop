# Notas do deploy k8s

- **frontend**: a imagem publicada (`ghcr.io/justgu1/tyershop-frontend`) serve via nginx estático (stage `prod` do Dockerfile). As rotas `/product/[handle]` e `/collections/[handle]` são SSR sob demanda (`prerender = false`) e **vão quebrar** — nginx não roda o adapter Node. Pra funcionar de verdade precisa trocar o Dockerfile pra rodar `node dist/server/entry.mjs` (porta 4321) em vez de nginx, ou usar outro target.
- **`PUBLIC_*` do frontend são build-time** (embutidos no bundle Astro no `astro build` do CI). As env vars setadas no Deployment (`PUBLIC_MEDUSA_URL`, `PUBLIC_API_URL` etc.) **não têm efeito** no client já compilado — só valem se reconstruir a imagem com esses valores como build args.
- `PUBLIC_MEDUSA_PUBLISHABLE_KEY` e `PUBLIC_MEDUSA_REGION_ID` só existem depois de o backend Medusa subir e alguém criar a publishable key + região pelo painel admin (`medusa.homolog.tyershop.com`) — estão `CHANGEME` até lá.
- `MERCADOPAGO_ACCESS_TOKEN`, `PUBLIC_MERCADOPAGO_PUBLIC_KEY`, `SMTP_HOST` e afins: `CHANGEME`, precisam do valor real.
- Redis: usuário ACL `tyershop` ficou **sem restrição de prefixo** (`~*`), diferente do padrão do resto do shared — Medusa não expõe opção de prefixar chaves nativamente, então restringir a `tyershop_*` quebraria a aplicação.
- Domínios usados: `homolog.tyershop.com` (frontend), `medusa.homolog.tyershop.com` (backend/admin), `api.homolog.tyershop.com` (serviço de pagamento/email) — os 2 últimos são novos, precisam de DNS.

## Homologação e produção separadas

- `k8s/` é a homologação (namespace `apps`, Application `tyershop`, caminho inalterado). `k8s/prod/` é a produção (namespace `tyershop-prod`, hosts `tyershop.com`, `www`, `medusa.` e `api.`). Os dois partem de `k8s/base/`, que guarda os Deployments e Services; `prod/` só troca hosts, URLs internas, bucket e credenciais.
- Produção não usa o argocd-image-updater: a imagem só muda quando `images[].newTag` em `prod/kustomization.yaml` muda (promover um `sha-<commit>` já validado em homologação).
- `EMAIL_TEST_MODE` fica `"true"` em produção até o go-live; trocar por `"false"` em `prod/backend.yaml` ao abrir as vendas.
- Para conferir o que cada ambiente renderiza: `kubectl kustomize k8s` e `kubectl kustomize k8s/prod`.

### Go-live da produção (fora deste repositório)

1. Banco: criar o database e o usuário de produção no Postgres compartilhado e um usuário/ACL no Redis; os dois URLs vão em `BACKEND_DATABASE_URL` e `BACKEND_REDIS_URL`.
2. MinIO: criar o bucket público `tyershop-prod` e o usuário `tyershop-prod`; no `infra-k8s`, rota `/cdn` de `api.tyershop.com` para esse bucket (mesmo padrão do `api.homolog`).
3. Segredos: `cp k8s/prod/secrets.env.example k8s/prod/secrets.env`, preencher, `k8s/prod/selar-secrets.sh` e versionar o `sealed-secret.yaml`. `PUBLIC_MEDUSA_PUBLISHABLE_KEY` e `PUBLIC_MEDUSA_REGION_ID` só existem depois que o backend sobe e a região e a chave são criadas no admin: selar de novo depois.
4. Melhor Envio: app de produção (client id/secret), redirect `https://tyershop.com/melhor-envio/callback`, e o id da agência em `prod/melhor-envio-config.yaml`.
5. Mercado Pago: credenciais de produção e o webhook `https://medusa.tyershop.com/hooks/payment/mercadopago_mercadopago` (o segredo vai em `MERCADOPAGO_WEBHOOK_SECRET`).
6. Migrações e dados: o backend de produção roda as migrações ao subir; depois criar o admin, a região, a chave publicável e o canal de vendas.
7. DNS de `tyershop.com`, `www`, `medusa` e `api` para a VPS; certificado sai pelo `letsencrypt` do Traefik.
8. `kubectl apply -f k8s/prod/argocd-application.yaml`. Só então faça o merge deste PR: sem a Application de produção, `tyershop.com` fica sem rota (a homologação deixou de responder por ele).

## E-mail: cópia, reply e rastreio

- `SMTP_BCC` (cópia oculta de todo e-mail, menos redefinição de senha) e `SMTP_REPLY_TO` ficam em `base/backend.yaml`. O SMTP da Hostinger não grava em "Enviados"; a cópia é o que aparece na caixa `suporte@`.
- O link "Abra no navegador" (`/email/<id>?t=<token>`) registra a visualização em `email_view`. O local vem dos cabeçalhos `cf-ipcountry` e `cf-ipcity` da Cloudflare; a cidade só chega com a regra "Add visitor location headers" ligada.
- DNS (painel da Hostinger, fora do repositório): o DMARC de `tyershop.com` está `v=DMARC1; p=none` sem relatório. Para receber os relatórios agregados use `v=DMARC1; p=none; rua=mailto:suporte@tyershop.com` e só suba para `quarantine` depois de semanas de relatórios limpos.
- A rotina `sync-support-inbox` (a cada 10 min) usa `SMTP_USER`/`SMTP_PASSWORD` no IMAP (`IMAP_HOST`) para arquivar `suporte@` por pasta, registrar e-mails devolvidos em `/admin/emails` e encaminhar respostas de clientes a `SMTP_REPLY_TO`. Trocar a senha da caixa exige atualizar o `tyershop-secrets`.
