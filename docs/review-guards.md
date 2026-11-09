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
- **Etiqueta cancelada ou expirada no Melhor Envio não prende o pedido.** O acompanhamento marca o erro e o admin pode
  refazer; etiqueta ativa ou sem resposta nunca é refeita, para não cobrar duas vezes.
  Origem: etiqueta removida ou expirada no Melhor Envio seguia como confirmada no Medusa.
  Guard: `label.unit.spec.ts` ("etiqueta viva ou sem resposta não é perdida: não se cobra de novo às cegas") e `label.unit.spec.ts`
  ("cancelada e expirada contam como perdidas, nas duas grafias").

## Homologação
- **O sandbox do Melhor Envio soma a Jadlog aos serviços; produção segue só com Correios.** A conta de teste só cota `.Package` e
  `.Com`; sem isso a homologação não oferecia frete e nenhum teste de pagamento chegava ao Pix.
  Origem: validação do Pix em homologação.
  Guard: `quote.unit.spec.ts` ("produção oferece só Correios; o sandbox soma a Jadlog, a única que a conta de teste cota").

## Checkout e pagamento

- **Erro do Mercado Pago volta ao cliente em português, nunca o texto cru.** Um e-mail recusado virava 500 "An unknown error
  occurred".
  Origem: achado no teste real da homologação (pedido de teste).
  Guard: `friendly-error.unit.spec.ts` ("nunca devolve o texto cru ao cliente") e `friendly-error.unit.spec.ts` ("trata falha do
  Mercado Pago como indisponibilidade").
- **A cobrança no cartão leva itens, telefone e endereço de entrega ao antifraude do Mercado Pago.** Sem esses dados a nota de
  risco sobe e compras legítimas voltam como `cc_rejected_high_risk`.
  Origem: pagamento recusado por análise de segurança em produção, `createCardPayment`.
  Guard: `additional-info.unit.spec.ts` ("leva itens, telefone separado em DDD e número e o endereço de entrega").
- **Um carrinho só é concluído por uma execução de cada vez.** Chamadas paralelas de `/store/checkout/complete` (e a conciliação)
  faziam a perdedora falhar e o Medusa reembolsar o Pix da vencedora: o pedido existia, pendente, e o cliente era reembolsado.
  Origem: pedidos 1216, 1238, 1246, 1257 e 1261 em produção.
  Guard: `complete-lock.unit.spec.ts` ("uma execução por carrinho: a rota do checkout e a conciliação usam a mesma trava").
- **Poucas conclusões de carrinho rodam ao mesmo tempo por processo.** Cada uma usa várias conexões do banco: 20 chamadas
  simultâneas na homologação esgotaram o pool (15) mesmo sem esperar na trava, derrubando também a conciliação e o job de ingressos.
  Origem: segundo teste de corrida na homologação.
  Guard: `complete-lock.unit.spec.ts` ("poucas conclusões rodam ao mesmo tempo por processo: o resto espera em memória, sem conexão do banco").
- **A conclusão do carrinho não espera na trava.** Cada espera prende uma conexão do banco: 24 chamadas simultâneas na homologação
  esgotaram o pool e deixaram pedidos órfãos (sem carrinho nem pagamento), como o 1240 em produção. Quem não pega a trava só
  aguarda o pedido aparecer.
  Origem: teste de corrida na homologação.
  Guard: `complete-lock.unit.spec.ts` ("quem não pega a trava não espera nela: cada espera prenderia uma conexão do banco e esgotaria o pool").
- **O webhook do Mercado Pago não conclui o carrinho.** Com ele concluindo em paralelo ao checkout, a execução perdedora
  desfazia o pagamento da vencedora e criava pedido duplicado sem cobrança (1240, cópia do 1238).
  Origem: pedidos 1216, 1238, 1240, 1246, 1257 e 1261 em produção.
  Guard: `webhook-action.unit.spec.ts` ("pagamento aprovado não conclui o carrinho: quem conclui é o checkout e a conciliação, sob a mesma trava").
- **O e-mail do checkout é conferido: formato, domínio de provedor digitado errado (gamail.com) e domínio sem servidor de e-mail.**
  O formulário só exigia `type="email"` e a compra saía com e-mail que nunca receberia a confirmação.
  Origem: pedido real com e-mail @gamail.com.
  Guard: `email.unit.spec.ts` ("recusa domínio de provedor conhecido escrito errado e sugere o certo") e `email.unit.spec.ts`
  ("recusa formato inválido").
- **Todo item enviado ao Mercado Pago leva `category_id` e `description`, e o cartão leva `statement_descriptor`.** O painel de
  qualidade da integração pede os três para o antifraude aprovar mais e para reduzir contestação.
  Origem: painel de qualidade da integração do Mercado Pago, `buildAdditionalInfo` e `createCardPayment`.
  Guard: `additional-info.unit.spec.ts` ("todo item leva categoria e descrição (pedidos do painel de qualidade do Mercado Pago)") e
  `additional-info.unit.spec.ts` ("o nome na fatura cabe nos 16 caracteres do Mercado Pago").
- **Pix e cartão enviam os mesmos dados de antifraude ao Mercado Pago.** O Pix ia sem `additional_info` e a medição de qualidade,
  feita sobre um Pix, cobrou código, descrição e categoria dos itens; o cartão ia sem nome e sobrenome do pagador e sem `issuer_id`.
  Origem: painel de qualidade da integração (nota 51), `createPixPayment` e `createCardPayment`.
  O Device ID também vai no Pix.
  Guard: `client-payload.unit.spec.ts` ("o Pix leva additional_info com os itens, como o cartão"), `client-payload.unit.spec.ts`
  ("o Pix leva o Device ID no cabeçalho, como o cartão") e `client-payload.unit.spec.ts` ("o cartão leva nome e sobrenome do pagador,
  emissor e nome na fatura").

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
- **O e-mail do ingresso não leva a faixa de redes sociais.** Com ela o Gmail tende a mandá-lo para Promoções, e é uma
  mensagem pessoal com link de acesso.
  Origem: ingresso do Drop 6 caindo na aba Promoções.
  Guard: `templates.unit.spec.ts` ("não leva a faixa de redes sociais, para não parecer e-mail promocional").

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

## Planilha de vendas

- **A Base de dados da planilha só leva pedido, momento, produto e valores.** Nome, e-mail, CPF, endereço e dados de pagamento
  não entram, e as outras abas só leem a base por fórmula.
  Origem: pedido de integração com o Google Sheets, `buildBase`.
  Guard: `aggregate.unit.spec.ts` ("a base só tem as colunas permitidas, sem dado de cliente") e `aggregate.unit.spec.ts`
  ("todo número do resumo e do detalhe é fórmula sobre a Base de dados").
- **O ID da planilha e a conta de serviço vêm só de Secret.** O repositório é público e o link da planilha também.
  Origem: pedido de integração com o Google Sheets, `sheetsFromEnv`.
  Guard: `segredos-ignorados.test.mjs` ("o ID da planilha não aparece em arquivo versionado").
- **As fórmulas da planilha usam o separador de argumentos do idioma da planilha.** Em `pt_BR` a vírgula dava `#ERROR!` em
  toda célula de resumo e de detalhe.
  Origem: primeira execução em produção, `renderTab`.
  Guard: `aggregate.unit.spec.ts` ("pt_BR usa ponto e vírgula, en_US usa vírgula") e `aggregate.unit.spec.ts` ("em pt_BR
  nenhuma fórmula sai com vírgula e o texto comum fica intacto").
- **A contagem de pedidos da planilha dá 0, e não 1, quando não há venda.** `COUNTUNIQUE` conta o erro do `FILTER` vazio como
  um pedido.
  Origem: primeira execução em produção, aba Drop 6 sem venda global.
  Guard: `aggregate.unit.spec.ts` ("não usa COUNTUNIQUE, que conta o erro do FILTER vazio como 1 pedido").
- **Toda aba de venda lista, por pedido, o número, a peça e a variação (cor e tamanho).** Só com totais por dia não dava para
  saber o que produzir ou separar para cada pedido.
  Origem: pedido ao ver as abas da planilha, `renderTab`.
  Guard: `aggregate.unit.spec.ts` ("cada aba lista pedido, peça e variação por fórmula sobre a base, sem chaves de array") e
  `aggregate.unit.spec.ts` ("a base guarda a variação (cor e tamanho) de cada item").

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
- **O frontend envia o Device ID (`MP_DEVICE_SESSION_ID`) na cobrança.** Falta teste de frontend (não há runner configurado).
  Origem: mesma recusa, `submitCard`.
- **Pagamento com cartão recusado não segue para fechar o pedido.** O frontend ignorava o `status` da cobrança e o cliente via
  o erro cru "was not authorized with the provider". Falta teste de frontend (não há runner configurado).
  Origem: cartão emitido fora do Brasil recusado em produção, `submitCard`.
- **Erro de campo obrigatório nunca fica atrás de um bloco escondido (dados ou endereço), e cada passo do checkout mobile tem um só botão de avançar.**
  Cliente logado sem CPF salvo via o cartão-resumo no lugar do form: "Continuar" falhava a validação num campo invisível e
  parecia não fazer nada; havia dois "Continuar". Falta teste de frontend (não há runner configurado).
  Origem: checkout mobile travado no passo "Seus dados", `validateRequiredFields`.
