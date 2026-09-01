import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createOrderWorkflow } from "@medusajs/medusa/core-flows";

interface CsvRow {
  "Número do Pedido": string;
  "E-mail": string;
  Data: string;
  "Status do Pedido": string;
  "Status do Pagamento": string;
  "Status do Envio": string;
  Moeda: string;
  Subtotal: string;
  Desconto: string;
  "Valor do Frete": string;
  Total: string;
  "Nome do comprador": string;
  "CPF / CNPJ": string;
  Telefone: string;
  "Nome para a entrega": string;
  Endereço: string;
  Número: string;
  Complemento: string;
  Bairro: string;
  Cidade: string;
  "Código postal": string;
  Estado: string;
  País: string;
  "Forma de Entrega": string;
  "Forma de Pagamento": string;
  "Nome do Produto": string;
  "Valor do Produto": string;
  "Quantidade Comprada": string;
  SKU: string;
}

const REGION_ID = "reg_01M1F3BE3DPC7HPNNF8ZZG21F2";
const SALES_CHANNEL_ID = process.env.TYER_SALES_CHANNEL_ID || "";

function norm(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}
/** Preto/Preta, Amarelo/Amarela etc viram o mesmo token pra casar com o CSV. */
function normToken(s: string): string {
  return norm(s).replace(/[oa]$/, "");
}
function money(s: string): number {
  const n = Number(String(s || "0").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

interface CatalogVariant {
  id: string;
  optionValues: string[]; // valores normalizados (token) das opções desse variant
}
interface CatalogProduct {
  id: string;
  title: string;
  handle: string;
  thumbnail: string | null;
  variants: CatalogVariant[];
  colorValues: string[]; // valores normalizados so das opcoes "Cor"
}

/** Nomes antigos da loja (Nuvemshop) que nao batem literal com o titulo atual. */
const MANUAL_ALIASES: Record<string, string> = {
  "camiseta dry fit tyer starter": "camiseta tyer starter | dry-fit",
};

function parseProductName(raw: string): { base: string; parenTokens: string[] } {
  let name = String(raw || "").trim();
  let parenContent = "";
  const parenMatch = name.match(/\(([^)]*)\)\s*$/);
  if (parenMatch) {
    parenContent = parenMatch[1];
    name = name.slice(0, parenMatch.index).trim();
  }
  return {
    base: name,
    parenTokens: parenContent.split(",").map((t) => t.trim()).filter(Boolean),
  };
}

/**
 * Resolve o produto do catalogo a partir do nome livre do CSV. Tenta, nessa ordem:
 * 1. titulo completo (com "|" se o titulo real tiver, ex. "... | Dry-fit");
 * 2. alias manual;
 * 3. titulo antes do "|" (nomes antigos que omitiam o sufixo);
 * 4. titulo + cada cor (nomes antigos que grudavam a cor no nome, ex. "Regata Savage Mode Branca").
 * Quando bate pelo caminho 3/4, pode devolver um token extra (a cor implicita).
 */

function matchVariant(
  product: CatalogProduct,
  tokens: string[]
): { variantId: string; approximate: boolean } {
  const normTokens = tokens.map(normToken);
  if (product.variants.length === 1) {
    return { variantId: product.variants[0].id, approximate: false };
  }
  const exact = product.variants.find((v) =>
    v.optionValues.every((ov) => normTokens.includes(ov))
  );
  if (exact) return { variantId: exact.id, approximate: false };
  // aproximado: bate pelo menos 1 valor de opcao
  const partial = product.variants.find((v) => v.optionValues.some((ov) => normTokens.includes(ov)));
  if (partial) return { variantId: partial.id, approximate: true };
  return { variantId: product.variants[0].id, approximate: true };
}

export default async function importOrders({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const limit = args && args[0] && Number.isFinite(Number(args[0])) ? Number(args[0]) : Infinity;

  // ---------- catalogo ----------
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "thumbnail",
      "variants.id",
      "variants.options.value",
      "variants.options.option.title",
    ],
  });
  const catalog: CatalogProduct[] = products.map((p: any) => ({
    id: p.id,
    title: p.title,
    handle: p.handle,
    thumbnail: p.thumbnail,
    variants: (p.variants || []).map((v: any) => ({
      id: v.id,
      optionValues: (v.options || []).map((o: any) => normToken(o.value)),
    })),
    colorValues: Array.from(
      new Set(
        (p.variants || [])
          .flatMap((v: any) => v.options || [])
          .filter((o: any) => /\b(cor|color)\b/i.test(String(o.option?.title || "")))
          .map((o: any) => normToken(o.value))
      )
    ),
  }));
  const byFullTitle = new Map<string, CatalogProduct>();
  const byPrePipeTitle = new Map<string, CatalogProduct>();
  const byTitleColor = new Map<string, { product: CatalogProduct; color: string }>();
  for (const p of catalog) {
    byFullTitle.set(norm(p.title), p);
    if (p.title.includes("|")) {
      byPrePipeTitle.set(norm(p.title.split("|")[0]), p);
    }
  }
  logger.info(`Catalogo: ${catalog.length} produtos carregados.`);

  /** "Regata Savage Mode Branca" -> produto "Regata Savage Mode..." + token "branca",
   *  pela via: acha o produto cujo titulo (sem "| sufixo") e prefixo do nome recebido,
   *  e cuja ultima palavra do nome recebido bate com uma cor real do produto. */
  function resolveByTrailingColor(base: string): { product: CatalogProduct; color: string } | null {
    const words = base.trim().split(/\s+/);
    if (words.length < 2) return null;
    const lastWord = words[words.length - 1];
    const lastTok = normToken(lastWord);
    const csvStem = norm(words.slice(0, -1).join(" "));
    for (const p of catalog) {
      if (!p.colorValues.includes(lastTok)) continue;
      // o proprio titulo do catalogo pode ja ter uma cor grudada no fim
      // (ex. "Regata Savage Mode Preta") — tira antes de comparar o stem.
      const titleBeforePipe = (p.title.split("|")[0] || p.title).trim();
      const titleWords = titleBeforePipe.split(/\s+/);
      const titleLastTok = normToken(titleWords[titleWords.length - 1]);
      const catalogStem = p.colorValues.includes(titleLastTok)
        ? norm(titleWords.slice(0, -1).join(" "))
        : norm(titleBeforePipe);
      if (catalogStem === csvStem) return { product: p, color: lastWord };
    }
    return null;
  }

  function resolveProduct(base: string): { product: CatalogProduct; extraToken?: string } | null {
    const k = norm(base);
    // 1. nome bate literal com o titulo do catalogo (inclui "|" se o titulo real tiver)
    if (byFullTitle.has(k)) return { product: byFullTitle.get(k)! };
    const alias = MANUAL_ALIASES[k];
    if (alias && byFullTitle.has(alias)) return { product: byFullTitle.get(alias)! };
    // 2. "Titulo | Cor" onde o catalogo NAO tem "|" no titulo — cor vira token extra
    if (base.includes("|")) {
      const [before, after] = base.split("|");
      const beforeKey = norm(before);
      if (byFullTitle.has(beforeKey)) {
        return { product: byFullTitle.get(beforeKey)!, extraToken: (after || "").trim() };
      }
    }
    // 3. "Titulo" sem o sufixo que o catalogo tem depois do "|" (ex.: catalogo
    //    "Shorts Tyer Red Rose | Dry-fit", CSV so manda "Shorts Tyer Red Rose")
    if (byPrePipeTitle.has(k)) return { product: byPrePipeTitle.get(k)! };
    // 4. cor grudada no fim do nome (nomenclatura antiga), ex. "Regata Savage Mode Branca"
    const trailingColor = resolveByTrailingColor(base);
    if (trailingColor) return { product: trailingColor.product, extraToken: trailingColor.color };
    return null;
  }

  // ---------- sales channel default ----------
  let salesChannelId = SALES_CHANNEL_ID;
  if (!salesChannelId) {
    const { data: channels } = await query.graph({
      entity: "sales_channel",
      fields: ["id", "name"],
    });
    salesChannelId = channels[0]?.id || "";
  }

  // ---------- clientes ja importados ----------
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
  });
  const customerByEmail = new Map<string, string>();
  for (const c of customers) customerByEmail.set(String(c.email || "").toLowerCase(), c.id);

  // ---------- pedidos ja importados (idempotencia) ----------
  const { data: existingOrders } = await query.graph({
    entity: "order",
    fields: ["id", "metadata"],
  });
  const importedOrderNumbers = new Set(
    existingOrders
      .map((o: any) => o.metadata?.nuvemshop_order_number)
      .filter((v: any) => v != null)
      .map((v: any) => String(v))
  );

  // ---------- CSV ----------
  const csvPath = path.join(process.cwd(), "data", "vendas-nuvemshop.csv");
  const content = fs.readFileSync(csvPath, "utf-8");
  const rows: CsvRow[] = parse(content, { columns: true, skip_empty_lines: true, delimiter: ";" });
  logger.info(`Lidas ${rows.length} linhas de vendas.`);

  // agrupa por numero do pedido, carregando os campos do pedido da 1a linha
  const orders = new Map<
    string,
    { head: CsvRow; items: CsvRow[] }
  >();
  for (const row of rows) {
    const num = row["Número do Pedido"]?.trim();
    if (!num) continue;
    if (!orders.has(num)) orders.set(num, { head: row, items: [] });
    orders.get(num)!.items.push(row);
  }
  logger.info(`Pedidos agrupados: ${orders.size}.`);

  let created = 0;
  let skippedExisting = 0;
  let skippedNoItems = 0;
  let failed = 0;
  const unmatchedNames = new Map<string, number>();
  const approximateMatches: string[] = [];

  let processed = 0;
  for (const [orderNumber, { head, items }] of orders) {
    if (processed >= limit) break;
    processed++;

    if (importedOrderNumbers.has(orderNumber)) {
      skippedExisting++;
      continue;
    }

    const lineItems: any[] = [];
    for (const item of items) {
      const productName = item["Nome do Produto"]?.trim();
      if (!productName) continue;
      const { base, parenTokens } = parseProductName(productName);
      const resolved = resolveProduct(base);
      if (!resolved) {
        unmatchedNames.set(productName, (unmatchedNames.get(productName) || 0) + 1);
        continue;
      }
      const { product, extraToken } = resolved;
      const tokens = [...parenTokens, extraToken].filter(Boolean) as string[];
      const { variantId, approximate } = matchVariant(product, tokens);
      if (approximate) approximateMatches.push(`${productName} -> ${product.title}`);
      const qty = Math.max(1, Math.round(Number(item["Quantidade Comprada"]) || 1));
      const unitPrice = money(item["Valor do Produto"]);
      lineItems.push({
        title: product.title,
        product_id: product.id,
        product_title: product.title,
        product_handle: product.handle,
        variant_id: variantId,
        thumbnail: product.thumbnail || undefined,
        quantity: qty,
        unit_price: unitPrice,
      });
    }

    if (!lineItems.length) {
      skippedNoItems++;
      continue;
    }

    const email = head["E-mail"]?.trim().toLowerCase();
    const customerId = email ? customerByEmail.get(email) : undefined;
    const [firstName, ...lastNameParts] = (head["Nome para a entrega"] || head["Nome do comprador"] || "Cliente")
      .trim()
      .split(/\s+/);

    const orderInput: any = {
      region_id: REGION_ID,
      currency_code: "brl",
      sales_channel_id: salesChannelId || undefined,
      customer_id: customerId,
      email: email || undefined,
      status: "pending",
      items: lineItems,
      shipping_address: {
        first_name: firstName || "Cliente",
        last_name: lastNameParts.join(" ") || "",
        address_1: head["Endereço"] || "N/A",
        address_2: head["Complemento"] || undefined,
        city: head["Cidade"] || "N/A",
        province: head["Estado"] || undefined,
        postal_code: head["Código postal"] || "00000000",
        country_code: "br",
        phone: head["Telefone"] || undefined,
      },
      metadata: {
        source: "nuvemshop_import",
        nuvemshop_order_number: orderNumber,
        nuvemshop_order_status: head["Status do Pedido"] || undefined,
        nuvemshop_payment_status: head["Status do Pagamento"] || undefined,
        nuvemshop_shipping_status: head["Status do Envio"] || undefined,
        nuvemshop_payment_method: head["Forma de Pagamento"] || undefined,
        nuvemshop_shipping_method: head["Forma de Entrega"] || undefined,
        nuvemshop_order_date: head["Data"] || undefined,
        nuvemshop_subtotal: head["Subtotal"] || undefined,
        nuvemshop_discount: head["Desconto"] || undefined,
        nuvemshop_shipping_cost: head["Valor do Frete"] || undefined,
        nuvemshop_total: head["Total"] || undefined,
      },
    };

    try {
      await createOrderWorkflow(container).run({ input: orderInput });
      created++;
    } catch (err: any) {
      failed++;
      logger.info(`Falha pedido ${orderNumber}: ${err?.message}`);
    }

    if (processed % 100 === 0) logger.info(`  ...${processed}/${orders.size} pedidos processados`);
  }

  logger.info("========================================");
  logger.info(`Pedidos criados: ${created}`);
  logger.info(`Ja existiam (pulados): ${skippedExisting}`);
  logger.info(`Sem nenhum item casado (pulados): ${skippedNoItems}`);
  logger.info(`Falhas ao criar: ${failed}`);
  logger.info(`Nomes de produto sem match (${unmatchedNames.size} distintos):`);
  for (const [name, count] of [...unmatchedNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    logger.info(`  ${count}x "${name}"`);
  }
  logger.info(`Matches aproximados (variante nao 100% certa): ${approximateMatches.length}`);
  logger.info("========================================");
}
