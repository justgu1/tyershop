# Teste de carga

Meta: **p99 < 1000 ms** com **1000 requisições/s de navegação** e **500 finalizações de pedido/s**, ao mesmo tempo.

O teste usa [k6](https://k6.io). Cada finalização percorre o caminho inteiro: carrinho → item → endereço → opções de frete → frete → coleção e sessão de pagamento → pagamento aprovado → pedido concluído. Mercado Pago e Melhor Envio são trocados por um simulador (`mock-gateways.mjs`): o teste mede a loja, não os provedores.

## ⚠️ Rode só em ambiente descartável

O teste **cria milhares de contas, carrinhos e pedidos**. Homologação e produção usam o **mesmo banco**: nunca aponte para elas (o script recusa hosts `tyershop.com`). Suba uma cópia isolada (namespace próprio ou compose) com banco vazio e o mesmo tamanho de máquina que a produção, senão o resultado não vale.

## Preparar o ambiente

1. Subir o backend e o frontend de teste com:
   ```
   LOAD_TEST_MODE=true                              # desliga os limites de requisição (todos os acessos saem de poucos IPs)
   MERCADOPAGO_API_BASE=http://<simulador>:8099
   MELHOR_ENVIO_BASE_URL=http://<simulador>:8099
   MERCADOPAGO_ACCESS_TOKEN=qualquer-valor
   EMAIL_TEST_MODE=true                             # nenhum e-mail real; com muitos pedidos, considere ficar sem SMTP
   ```
2. Subir o simulador: `node loadtest/mock-gateways.mjs`.
3. Preparar os dados (drop em venda geral sem lote, produtos sem estoque controlado, token de frete falso). Exige `LOAD_TEST_MODE=true`:
   ```
   cd backend && npx medusa exec ./src/scripts/prepare-loadtest.ts
   ```
   O drop atual precisa ter produtos vinculados. Rode também uma vez `setup-melhor-envio-shipping.ts`.

## Rodar

```
docker run --rm -i -v "$PWD/loadtest:/lt" -w /lt grafana/k6 run \
  -e FRONT_URL=https://teste-carga.exemplo.com -e API_URL=https://teste-carga.exemplo.com \
  -e PUBLISHABLE_KEY=pk_... -e I_UNDERSTAND_THIS_CREATES_ORDERS=yes \
  -e PROFILE=smoke -e USERS=100 /lt/k6/load.js
```

| `PROFILE` | O que faz |
|---|---|
| `smoke` | 5 req/s de navegação e 1 finalização/s por 30 s. Valida o script e o ambiente. **Comece por aqui.** |
| `target` | Sobe em degraus até 1000 req/s e 500 finalizações/s e segura 10 minutos. É a meta. |
| `stress` | Passa da meta (até 3000 e 1500) para achar o ponto de quebra. |

- `USERS`: contas de teste criadas antes da carga. Cada finalização usa uma conta e a cobrança é serializada por cliente, então precisa haver mais contas que finalizações simultâneas. Para `target`, use `USERS=3000` ou mais.
- `P99_MS`: limite do p99 (padrão 1000).
- O resultado completo fica em `loadtest/resultado.json` e o resumo sai no terminal.

## Como ler

Os limites que o k6 confere (se algum falhar, o teste termina com erro):

- `http_req_duration{flow:browse}` e `{flow:checkout}`: p99 abaixo de `P99_MS`.
- `http_req_failed` por fluxo: menos de 1 % de erro.
- `dropped_iterations`: menos de 100. Se passar disso, **o gerador de carga ou o servidor não aguentou a taxa pedida**, mesmo que as respostas pareçam boas.
- `checks`: mais de 99 % das verificações (carrinho criado, frete aplicado, pagamento aprovado, pedido criado).

Por etapa: `step_cart_ms`, `step_line_item_ms`, `step_address_ms`, `step_shipping_options_ms`, `step_shipping_method_ms`, `step_payment_collection_ms`, `step_payment_session_ms`, `step_pay_ms`, `step_complete_ms`, e `checkout_total_ms` (fluxo inteiro). A etapa mais lenta mostra onde está o gargalo.

## Limites realistas desta meta

- 500 finalizações/s são cerca de **5000 requisições/s** a mais (cada finalização faz ~10 chamadas), além das 1000 de navegação. Um único gerador k6 raramente sustenta isso: use vários (k6 Operator no cluster ou várias máquinas, cada uma com uma fatia da taxa) e acompanhe CPU do gerador.
- O gargalo esperado é o **Postgres** (cada pedido grava dezenas de linhas) e a CPU do Medusa. Acompanhe conexões, CPU e locks do banco durante o teste.
- Hoje o backend roda em **uma réplica** (`replicas: 1`): provavelmente será preciso escalar horizontalmente (e usar Redis para locking e eventos) para chegar à meta.
