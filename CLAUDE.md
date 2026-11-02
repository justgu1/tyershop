# Tyershop — convenções do projeto

Medusa v2 (backend), Astro SSR (frontend), Kubernetes com ArgoCD. Homologação e produção são o mesmo deploy e o mesmo banco
(`k8s/`): qualquer teste real atinge o ambiente de produção. Limites, modo de teste de e-mail e agência do Melhor Envio mudam
por configuração, não por código.

## Comentários

No máximo 2 linhas, só o porquê não óbvio. Nada de histórico, data, branch ou incidente em comentário: isso vai no commit ou na
PR.

## Testes

- Regra de negócio: teste unitário (`backend/src/**/__tests__/*.unit.spec.ts`), com o serviço externo sempre simulado.
- Integração externa (Melhor Envio, Mercado Pago): o formato da resposta vem do sandbox real, não da documentação. Resposta
  real observada vira teste (ver `docs/review-guards.md`).
- `cd backend && npm run test:unit` e `npx tsc --noEmit` antes de abrir PR.

## Guards de review

Todo achado de code review resolvido vira guard e é anotado em `docs/review-guards.md`: o problema como regra, a origem e o
teste que falha se voltar (nome do arquivo entre crases e o nome do teste entre aspas). Ao receber um achado, consulte a
lista; antes de implementar e antes de abrir PR, confira o diff contra ela. Problema registrado não pode se repetir, nem em
outra tela.

`npm run guards:check` (roda na CI, junto com os testes do backend) recusa entrada sem guard existente. Achado ainda sem teste
vai em "Pendentes de guard".

## Antes de pedir revisão

1. **Integração externa**: rode o fluxo no sandbox real antes da PR. Nomes de campo, escopos e ids de teste só se descobrem lá.
2. **Edição por script**: confira que a troca aconteceu (o comando deve falhar se não achar o trecho) e que o tipo compila
   (`tsc`); abra a página ou rota afetada. Build passando não prova que um import existe.
3. **Texto repetido**: avisos e mensagens que aparecem em mais de um lugar vêm de uma constante única.
4. **Mensagem que promete algo** ("enviamos um e-mail") só existe onde o sistema cumpre a promessa.
5. **Configuração por ambiente** fica em ConfigMap/Secret versionado ou documentado, não solta no código.
6. **Evidência na PR**: escreva na descrição o que foi verificado e como ("o rastreio devolve `pending` para etiqueta no
   carrinho: testado no sandbox"). O revisor não roda código e repete a dúvida a cada rodada se não vir a evidência.

## Ciclo de revisão

No máximo 5 rodadas de revisão e correção por PR. Achado real: corrija e registre o guard. Achado repetido que já tem evidência:
responda na descrição da PR, não mude o código. Decisão de produto ou risco novo: pare e avise a pessoa.
