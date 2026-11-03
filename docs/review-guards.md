# Guards de review

Todo achado de code review resolvido entra aqui. Cada entrada diz qual foi o problema, onde apareceu e qual guard impede que
ele volte. Antes de implementar, e de novo antes de abrir uma PR, confira o diff contra esta lista: um problema já registrado
não pode reaparecer, nem em outra tela.

O guard precisa ser automático: um teste que falha sem o ajuste, um helper ou validação compartilhada que já resolve o caso, ou
uma checagem de CI. Uma nota sozinha não conta. `node tools/check-review-guards.mjs` (`npm run guards:check`, roda na CI)
recusa entrada cujo guard não exista.

Formato de cada entrada:

- **Problema** em uma frase, já como regra ("X precisa Y").
  Origem: PR e arquivo do achado.
  Guard: `arquivo-do-teste.ts` ("nome do teste entre aspas").

Achado sem guard ainda vai em "Pendentes de guard", no fim: fica visível, mas não vale como resolvido.

## Melhor Envio

- **O carrinho do Melhor Envio usa os nomes de campo da API real.** `unit_value` em vez de `unitary_value` voltava 422, e sem
  `agency` os serviços da Jadlog respondiam 500 genérico.
  Origem: PR 39, achado ao testar no sandbox real.
  Guard: `label.unit.spec.ts` ("leva endereço, CPF, itens, volume e declaração de conteúdo") e `label.unit.spec.ts`
  ("vai no pedido quando informado e some quando não").
- **Sem saber a situação da etiqueta no Melhor Envio, não se paga.** Uma consulta sem entrada era tratada como "pendente" e
  levava a pagar de novo uma etiqueta já paga.
  Origem: PR 40, `getLabel`.
  Guard: `client.unit.spec.ts` ("sem entrada para a etiqueta é erro, para quem chama não pagar às cegas").
- **Falha ao consultar o carrinho do Melhor Envio é erro, nunca "não achei".** Tratar como ausência criava um segundo envio
  (e uma segunda etiqueta) para o mesmo pedido.
  Origem: PR 35, `findInCart`.
  Guard: `client.unit.spec.ts` ("falha de consulta é erro: não se cria outro envio às cegas") e `client.unit.spec.ts`
  ("carrinho grande demais para conferir é erro, não ausência").
- **O envio do pedido é achado em qualquer página do carrinho.** Só a primeira página deixava um envio já criado de fora.
  Origem: PR 35, `findInCart`.
  Guard: `client.unit.spec.ts` ("acha o envio do pedido pela etiqueta, em qualquer página do carrinho").

## Checkout e pagamento

- **Erro do Mercado Pago volta ao cliente em português, nunca o texto cru.** Um e-mail recusado virava 500 "An unknown error
  occurred".
  Origem: achado no teste real da homologação (pedido de teste).
  Guard: `friendly-error.unit.spec.ts` ("nunca devolve o texto cru ao cliente") e `friendly-error.unit.spec.ts` ("trata falha do
  Mercado Pago como indisponibilidade").

## Leads, convites e e-mails

- **Cadastro durante o cronômetro entra liberado; fora dele, pendente.**
  Origem: decisão do drop, PR 31.
  Guard: `status.unit.spec.ts` ("libera quem se cadastra durante o cronômetro").
- **Quem se descadastrou ou foi negado não é reativado por cadastro público.** Qualquer pessoa poderia reinscrever o e-mail de
  outra e disparar convites sem consentimento.
  Origem: PR 34.
  Guard: `status.unit.spec.ts` ("quem se descadastrou continua descadastrado, mesmo em um novo cadastro").
- **O link de descadastro vale só para o e-mail que o gerou.**
  Origem: PR 32.
  Guard: `unsubscribe.unit.spec.ts` ("o token vale só para o e-mail que o gerou, sem diferenciar maiúsculas").
- **Endereço `.invalid` nunca recebe e-mail, nem em modo de teste.** Permite simular muitos clientes sem gastar a cota do SMTP.
  Origem: PR 37.
  Guard: `test-mode.unit.spec.ts` ("reconhece o domínio reservado .invalid").
- **O assunto do e-mail não leva marca de teste; o aviso vai no fim do corpo.** O prefixo "[TESTE · ...]" pesa contra o e-mail
  nos filtros de spam, e o topo do corpo é o texto de pré-visualização.
  Origem: PR 40, cabeçalhos do e-mail de teste.
  Guard: `test-mode.unit.spec.ts` ("redirects to the test address, keeps the subject clean and reports the original") e
  `test-mode.unit.spec.ts` ("põe o aviso no fim do corpo, depois do texto de pré-visualização").
- **A confirmação do pedido lista itens com foto, entrega e pagamento, e as redes saem como ícones.**
  Origem: PR 39, pedido do cliente.
  Guard: `templates.unit.spec.ts` ("mostra foto, quantidade, endereço completo e pagamento") e `templates.unit.spec.ts`
  ("as redes sociais saem como ícones com texto alternativo").

## Testes e CI

- **A configuração do jest só importa pacotes que o backend declara.** `@medusajs/utils` só existia por acaso na instalação
  local, e a CI instalou só o backend e quebrou ("Cannot find module").
  Origem: PR 41, `jest.config.js`.
  Guard: `checks.yml` (job "Testes unitários do backend", que instala só o workspace do backend).

## Limites de requisição

- **O multiplicador de limites só vale quando definido, e multiplica todos.**
  Origem: PR 37, janela de teste.
  Guard: `rate-limit.unit.spec.ts` ("com escala 10, o mesmo limite comporta dez vezes mais").

## Teste de carga e segredos

- **A carga nunca roda contra a produção.** O bloqueio por `ALLOW_TYERSHOP_HOST` podia ser ligado no próprio Job e a carga criaria
  milhares de clientes, pedidos e pagamentos no banco real; agora produção é recusada sempre e outro destino pede confirmação.
  Origem: revisão da branch de carga na homologação, `loadtest/k8s/k6-homolog-job.yaml`.
  Guard: `loadtest-guards.test.mjs` ("a carga nunca roda contra a produção, mesmo confirmada").
- **`PAY_RATE` vazio não vira "ninguém paga".** `Number("")` dava 0 e a carga rodava sem nenhum pagamento.
  Origem: mesma revisão, `loadtest/k6/load.js`.
  Guard: `loadtest-guards.test.mjs` ("PAY_RATE vazio ou inválido vira 1 e não 0").
- **A limpeza da carga só apaga o que a carga criou.** Clientes e pedidos são reconhecidos pelo e-mail da carga.
  Origem: mesma revisão, `loadtest/limpar-carga.js`.
  Guard: `loadtest-guards.test.mjs` ("a limpeza reconhece só os e-mails criados pela carga").
- **A opção de frete se acha por `melhorenvio-<serviço>`.** Checkout, teste de carga e etiqueta casam a opção por esse `data.id`;
  mudar o formato faria todo checkout falhar em silêncio.
  Origem: mesma revisão, `loadtest/k6/load.js`.
  Guard: `quote.unit.spec.ts` ("o id do dado da opção de envio é melhorenvio-<serviço>, o formato que checkout e teste de carga procuram").
- **O `secrets.env` de produção é ignorado pelo git.** Guarda a URL do banco, do Redis e o `JWT_SECRET` em texto puro.
  Origem: mesma revisão, `k8s/prod/secrets.env`.
  Guard: `segredos-ignorados.test.mjs` ("o secrets.env de produção é ignorado pelo git").

## Pendentes de guard

- **Reservas do e-mail de confirmação expiram, para um envio interrompido ser refeito.** Falta teste de integração com banco.
  Origem: PR 35, `claimConfirmation`.
- **O metadata do pedido é gravado por chave.** Etiqueta e nota fiscal não podem sobrescrever uma à outra. Falta teste de
  integração com banco.
  Origem: PR 35, `setMetadataKey`.
- **O clique único de descadastro funciona sem `Origin`, e os demais formulários seguem checados.** O frontend não tem teste
  automático de middleware.
  Origem: PR 35, `middleware.ts`.
- **Toda troca de texto automática precisa falhar se não achar o trecho.** Um `replace` silencioso deixou um import de fora na
  home e o build passou. Falta uma checagem de uso de nomes não importados nas páginas Astro.
  Origem: PR 40, `index.astro`.
- **A carga devolve os limites normais mesmo se falhar ou for interrompida, e as esperas têm teto.** `run-homolog.sh` agora usa
  `trap` e prazos; falta um teste que simule a falha (hoje conferido só lendo o script e com `bash -n`).
- **Produto sem controle de estoque (`manage_inventory: false`) nunca aparece como esgotado nem com limite de quantidade.** O
  frontend lia o nível de estoque zerado e escondia a Tyer Gang. Falta teste de frontend (não há runner configurado).
  Origem: Tyer Gang esgotada em produção, `isVariantSoldOut`.
- **A tela Minha Conta não envia `email` ao atualizar o perfil.** O Medusa recusa o campo em `POST /store/customers/me` e o
  e-mail da conta é o que dá acesso à pré-venda. Falta teste de frontend (não há runner configurado).
  Origem: erro "Unrecognized fields: 'email'" ao salvar dados em produção.
