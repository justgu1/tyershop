import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";

const DESCRICOES: Record<string, string> = {
  "camiseta-tyer-gang": `<p><strong>CAMISA EXCLUSIVA TYER GANG | 4 ANOS DE MARCA</strong></p>
<p>Uma edição especial que celebra os 4 anos de história da TYER, criada para representar a essência da nossa comunidade.</p>
<p>Cada detalhe carrega elementos da cidade de São Paulo e simboliza a conexão entre todos que fazem parte da TYER GANG.</p>
<p><strong>Uma celebração da nossa história, da nossa cultura e de quem vive o basquete todos os dias.</strong></p>
<p><strong>EDIÇÃO LIMITADA: APENAS 50 UNIDADES.</strong></p>`,
  "short-compressao-cacada": `<p><strong>SHORT DE COMPRESSÃO TYER</strong></p>
<p>Desenvolvido para atletas profissionais e amadores que buscam elevar sua performance dentro de quadra. O Short de Compressão TYER oferece conforto, liberdade de movimento e suporte durante cada jogada, para que você possa se concentrar no que realmente importa: o seu jogo!</p>`,
  "calca-cacada": `<p><strong>CALÇA HOOPER "BORN TO HUNT" TYER</strong></p>
<p>Desenvolvida em tecido próprio para jogo, a Hooper Pant BORN TO HUNT foi pensada para quem vive o real basquete. Leve, confortável e com liberdade de movimento, é ideal para acompanhar você durante os jogos e treinos!</p>
<p>Tecido: Helanca 100% Poliéster | Dri Fit branco respirável</p>`,
  "regata-cacada": `<p><strong>REGATA CAÇADA TYER</strong></p>
<p>Inspirada na força, na agressividade e no instinto de quem nasceu para competir. A Regata CAÇADA traz uma estampa exclusiva de tigre em destaque, representando a essência da marca e a mentalidade de quem nunca foge da disputa.</p>
<p>Com design marcante e visual esportivo, é a peça ideal para representar sua paixão pelo basquete dentro e fora das quadras.</p>
<p><strong>STAY HUNGRY. STAY HUNTING.</strong></p>`,
};

// Idempotente: grava a descrição de cada peça do Drop 6.
export default async function descricoesDrop6({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "product", fields: ["id", "handle"], filters: { handle: Object.keys(DESCRICOES) } });
  for (const p of data as any[]) {
    await updateProductsWorkflow(container).run({ input: { selector: { id: p.id }, update: { description: DESCRICOES[p.handle] } } });
  }
  logger.info(`descrições gravadas: ${(data as any[]).length} de ${Object.keys(DESCRICOES).length}`);
}
