// Regra da loja: a última imagem da galeria é a tabela de medidas, em um arquivo chamado `medidas.webp` (o link «Ver medidas» o acha por esse nome).

/** Peças que ganharam a tabela: arquivo versionado em frontend/public/produtos, colocado por último. */
export const NOVAS: Record<string, string> = {
  "camiseta-tyer-gang": "exclusivos/tyer-gang/camiseta/medidas.webp",
  "short-compressao-cacada": "exclusivos/tyer-cacada/short-compressao/medidas.webp",
  "calca-cacada": "exclusivos/tyer-cacada/calca/medidas.webp",
  "regata-cacada": "exclusivos/tyer-cacada/regata/medidas.webp",
};

/** Peças que já tinham a tabela como foto numerada: o arquivo passou a se chamar `medidas.webp`. */
export const RENOMEADAS: Record<string, [RegExp, string][]> = {
  "camiseta-tyer-starter-dry-fit": [
    [/\/camiseta-preta\/6\.webp$/, "/camiseta-preta/medidas.webp"],
    [/\/camiseta-branca\/6\.webp$/, "/camiseta-branca/medidas.webp"],
  ],
  "regata-savage-mode": [
    [/\/regata-preta\/8\.webp$/, "/regata-preta/medidas.webp"],
    [/\/regata-branca\/7\.webp$/, "/regata-branca/medidas.webp"],
  ],
  tyertech: [[/\/jaqueta\/7\.webp$/, "/jaqueta/medidas.webp"]],
};

export const isMedidas = (url: string) => /\/medidas\.[a-z0-9]+(\?|$)/i.test(url);

export const renomear = (handle: string, url: string) =>
  (RENOMEADAS[handle] ?? []).reduce((u, [de, para]) => u.replace(de, para), url);

/** A tabela de medidas vai para o fim da galeria, sem mexer na ordem do resto. */
export const medidasPorUltimo = (urls: string[]) => [...urls.filter((u) => !isMedidas(u)), ...urls.filter(isMedidas)];
