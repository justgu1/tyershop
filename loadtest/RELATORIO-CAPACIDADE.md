# Relatório de capacidade — homologação (2026-11-02)

**Pergunta:** até onde o servidor atual aguenta sem escalar? **Meta de referência:** p99 < 1 s com 1000 req/s de navegação e 500 finalizações/s.

## Resposta curta

- Hoje o backend é **um processo Node de um núcleo**. Ele satura em **~1,2 finalizações/s** ou **~6 acessos/s à navegação** (a home gasta 262 ms de CPU por visita).
- Com os dois ao mesmo tempo e p99 abaixo de 1 s, o limite prático fica perto de **0,35 finalização/s + 2 acessos/s** (≈ 60 % de um núcleo, que é onde a latência ainda é boa). O teste confirmou: já em **5 acessos/s + 1 finalização/s o p99 foi 16 s** e 14 de 14 finalizações do degrau falharam.
- A meta (1000 + 500/s) está **mais de duas ordens de grandeza** acima do que um processo entrega: com os custos medidos seriam ~25 núcleos só de navegação (já com o cache novo) e ~400 núcleos para as finalizações. Não é questão de ajustar, é de arquitetura e tamanho de máquina (ver recomendações).
- O gargalo é **CPU do Node no backend** (framework do Medusa: ORM, consultas e orquestração de workflows), não o nosso código: o perfil de CPU não mostrou função nossa entre as principais.

## Como foi medido

Ambiente: homologação real do cluster (nó único de 4 vCPU/16 GB, dividido com outros apps), imagem com a PR #25/#26/#27. Pagamento e frete trocados pelo simulador (`mock-gateways.mjs`), limites de requisição desligados (`LOAD_TEST_MODE`), drop `carga-teste` em venda geral sem lote, produtos sem controle de estoque. Gerador k6 **dentro do cluster** (usou ~30 m de CPU, não distorce). Tudo foi desfeito no fim (pedidos 0, carrinhos 24, clientes 14, como antes).

Três medições:

1. **Custo de CPU por requisição**, lido do `/proc` do processo do servidor, chamadas sequenciais por dentro do pod (`medicao/custo-por-requisicao.js`).
2. **Custo por etapa da finalização** (`medicao/custo-da-finalizacao.js`), 15 repetições.
3. **Escada de carga** com k6 (`k6/load.js`, perfil `capacity`), de 5 a 150 acessos/s com 1 a 12 finalizações/s.

## Custo medido (CPU do backend por requisição)

| Operação | CPU | Capacidade de 1 núcleo |
|---|---:|---:|
| `GET /health` | 1 ms | ~1000/s |
| `GET /store/regions` | 6,5 ms | ~150/s |
| `GET /store/collections` | 6,2 ms | ~160/s |
| `GET /store/drop` | 10 ms | ~100/s |
| cotação de frete (`POST /store/shipping/quote`, em cache) | 8 ms | ~120/s |
| `GET /store/products?limit=12` | 67 ms | ~15/s |
| `POST /store/carts` | 85 ms | ~12/s |
| **página `/` (SSR + cascata de chamadas)** | **262 ms** | **~4/s** |
| **página `/drop`** | **254 ms** | **~4/s** |
| página `/cart` | 20 ms | ~50/s |

Finalização completa (soma 825 ms de CPU, sem contar a criação da conta, 100 ms, que é única):

| Etapa | CPU |
|---|---:|
| criar carrinho | 76 ms |
| adicionar item | 124 ms |
| endereço e e-mail | 153 ms |
| opções de frete | 45 ms |
| aplicar frete | 187 ms |
| coleção de pagamento | 24 ms |
| sessão de pagamento | 22 ms |
| pagar (cartão) | 28 ms |
| concluir pedido | 166 ms |
| **Total** | **825 ms → ~1,2 finalizações/s por núcleo** |

Nossas regras novas (acesso ao drop, limite por pessoa, conferência do frete) estão dentro dessas etapas e não aparecem como ponto quente.

## Escada de capacidade

| Degrau | Navegação | Finalização | p99 navegação | p99 finalização | Erro finalização | Pedidos |
|---|---:|---:|---:|---:|---:|---:|
| L1 | 5/s | 1/s | 16,3 s | 19,9 s | 6 % | 0 |
| L2 | 10/s | 2/s | 19,1 s | 29,5 s | 0 % | 0 |
| L3 | 20/s | 3/s | 23,3 s | 41,7 s | 0 % | 0 |
| L4 | 40/s | 5/s | 38,0 s | 52,1 s | 0 % | 0 |
| L5 | 80/s | 8/s | 60 s (limite) | 60 s | 100 % | 0 |
| L6 | 150/s | 12/s | 60 s | 60 s | 100 % | 0 |

Nenhum degrau cumpriu p99 < 1 s: o primeiro já estava acima da capacidade. O backend ficou em **1006 m de CPU (um núcleo inteiro)** e a memória subiu a 1,5 GB. No nó, a CPU total ficou em ~44 % (os outros três núcleos sem uso: o limite é o processo único, não a máquina). Sob saturação o Medusa passou a devolver `409 "Cart is already being completed by another request"` na conclusão do pedido (os workflows ficavam `not_started`): é o efeito colateral de o servidor não dar conta, e some quando a carga cabe.

Modelo conferido: no degrau L1 a demanda calculada é 5 × 153 ms + 1 × 825 ms = **1,6 núcleo** para um processo de 1 núcleo, e foi exatamente o que se viu.

## Ajustes feitos

| Ajuste | Onde | Efeito esperado |
|---|---|---|
| **Cache das consultas das páginas** (coleções e contagens, região, drop sem conta, linha Starter, configuração do site; 10 a 60 s; consultas simultâneas iguais viram uma só) | `frontend/src/lib/ssr-cache.ts` e chamadores | A home e o `/drop` deixam de custar ~260 ms de CPU do backend por visita; a navegação média cai de ~153 ms para ~25 ms (estimativa, **a confirmar depois do deploy**) → de ~6/s para ~40/s por núcleo |
| **Reservas de CPU/memória** nos pods do Tyer (`requests`) | `k8s/*.yaml` | O agendador passa a reservar espaço para o Tyer; hoje não há nenhuma reserva nem limite |
| **Migrações ao iniciar o contêiner** e **correção do build** | PRs #26 e #27 (já mescladas) | Sem elas a PR #25 nem chegava ao cluster |
| **Redis: usuários de ACL recriados** | Job `redis-acl-configure-rerun` no namespace `shared` | O backend tomava `WRONGPASS` o tempo todo; ver abaixo |
| Ferramentas de teste | `loadtest/` | Teste repetível no cluster (`run-in-cluster.sh up/run/down`), reversível |

## Problemas encontrados fora da carga

1. **O build das imagens da PR #25 falhava** (guarda de segredos rodando no `medusa build`): corrigido na #26.
2. **As migrações não rodavam na imagem de produção** (sem permissão de escrita em `node_modules`) e `medusa start` não migra: corrigido na #27, que também migra sozinho ao iniciar.
3. **Redis sem os usuários de ACL.** Só existia o usuário `default`; `tyershop`, `autoschedule`, `hericarealtor` e `cube` tinham sumido (o Redis reiniciou duas vezes e o ACL não é gravado em arquivo). Efeito: backend e outros apps recebendo `WRONGPASS`. Recriei os usuários rodando de novo o Job de configuração; **volta a acontecer a cada reinício do Redis**. Correção definitiva no repo de infra (`shared/redis`): configurar `aclfile` num volume persistente do chart (assim o `ACL SAVE` do Job grava) ou rodar o Job a cada início do Redis.

## Recomendações, em ordem de retorno

1. **Mesclar o cache e medir de novo** (`run-in-cluster.sh up`, `custo-por-requisicao.js`): confirma o ganho da navegação.
2. **Decidir a meta.** 500 finalizações/s é ordem de 400 núcleos neste Medusa; para um lançamento de drop, 500 finalizações **por minuto** (~8/s, ~7 núcleos) já seria uma meta forte. Com os custos medidos, qualquer número se converte em núcleos (825 ms de CPU por finalização, ~25 ms por visita com cache).
3. **Escalar para fora**: mais réplicas do backend (cada uma ~1,2 finalização/s) exigem Redis nos módulos do Medusa (workflow engine, locking, eventos, cache) em vez de memória, e um nó maior, porque os 4 vCPU de hoje já são divididos com outros apps e com o Postgres, que não medi (compartilhado, sem isolamento).
4. **Custo por finalização**: as etapas mais caras são aplicar frete (187 ms), conclusão (166 ms), endereço (153 ms) e item (124 ms). São do Medusa; mexer nelas é trabalho de otimização do framework (campos pedidos, versões) e não de configuração.
5. **Catálogo**: `GET /store/products` custa 67 ms; cabe cache na borda (Cloudflare) para visitante sem conta.
6. **Próximo teste**: repetir a escada com a meta reduzida (por exemplo `LEVELS="2:0,4:0,6:0"` para navegação e `0:1` para finalização) para achar o ponto exato de 1 s.

## Limites desta medição

- O pagamento e o frete foram simulados: o tempo de espera dos provedores reais soma latência (não CPU).
- O gerador k6 roda no mesmo nó; o uso dele foi baixo (~30 m), mas existe.
- Não medi a CPU do Postgres, que é compartilhado com os outros apps.
- O ganho do cache é estimado pela CPU por requisição; só fica confirmado depois do deploy.
