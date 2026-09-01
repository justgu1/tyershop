import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createCustomersWorkflow } from "@medusajs/medusa/core-flows";

interface CsvRow {
  "Nome completo": string;
  "CPF/CNPJ": string;
  "E-mail": string;
  "Telefone de Contato": string;
  Endereço: string;
  Número: string;
  Complemento: string;
  Cidade: string;
  Bairro: string;
  Estado: string;
  CEP: string;
  País: string;
  "Total Consumido (BRL)": string;
  "Número de Compras": string;
  "Última Compra": string;
  Cadastrado: string;
  "Inscrição para newsletter": string;
}

function splitName(full: string): { first_name: string; last_name: string } {
  const parts = String(full || "").trim().split(/\s+/);
  if (parts.length <= 1) return { first_name: parts[0] || "Cliente", last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

export default async function importCustomers({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const csvPath = path.join(process.cwd(), "data", "clientes-nuvemshop.csv");
  const content = fs.readFileSync(csvPath, "utf-8");
  const rows: CsvRow[] = parse(content, { columns: true, skip_empty_lines: true, delimiter: ";" });
  logger.info(`Lidas ${rows.length} linhas de clientes.`);

  const { data: existing } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
  });
  const existingEmails = new Set(existing.map((c: any) => String(c.email || "").toLowerCase()));

  const seenInFile = new Set<string>();
  const toCreate: any[] = [];
  let skippedNoEmail = 0;
  let skippedDup = 0;

  for (const row of rows) {
    const email = String(row["E-mail"] || "").trim().toLowerCase();
    if (!email) {
      skippedNoEmail++;
      continue;
    }
    if (existingEmails.has(email) || seenInFile.has(email)) {
      skippedDup++;
      continue;
    }
    seenInFile.add(email);
    const { first_name, last_name } = splitName(row["Nome completo"]);
    const phoneRaw = String(row["Telefone de Contato"] || "").trim();
    toCreate.push({
      email,
      first_name,
      last_name,
      phone: phoneRaw || undefined,
      metadata: {
        source: "nuvemshop_import",
        cpf_cnpj: row["CPF/CNPJ"] || undefined,
        address: row["Endereço"] || undefined,
        address_number: row["Número"] || undefined,
        complement: row["Complemento"] || undefined,
        city: row["Cidade"] || undefined,
        neighborhood: row["Bairro"] || undefined,
        state: row["Estado"] || undefined,
        postal_code: row["CEP"] || undefined,
        country: row["País"] || undefined,
        total_spent_brl: row["Total Consumido (BRL)"] || undefined,
        purchase_count: row["Número de Compras"] || undefined,
        last_purchase_at: row["Última Compra"] || undefined,
        registered_at: row["Cadastrado"] || undefined,
        newsletter_opt_in: row["Inscrição para newsletter"] || undefined,
      },
    });
  }

  logger.info(
    `A criar ${toCreate.length} clientes novos (sem e-mail: ${skippedNoEmail}, já existiam/duplicados: ${skippedDup}).`
  );

  const BATCH = 50;
  let created = 0;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const batch = toCreate.slice(i, i + BATCH);
    try {
      await createCustomersWorkflow(container).run({ input: { customersData: batch } });
      created += batch.length;
    } catch (err: any) {
      logger.info(`Falha no lote ${i}-${i + batch.length}: ${err?.message}. Tentando um a um...`);
      for (const c of batch) {
        try {
          await createCustomersWorkflow(container).run({ input: { customersData: [c] } });
          created++;
        } catch (err2: any) {
          logger.info(`  falhou ${c.email}: ${err2?.message}`);
        }
      }
    }
    if ((i / BATCH) % 5 === 0) logger.info(`  ...${Math.min(i + BATCH, toCreate.length)}/${toCreate.length}`);
  }

  logger.info(`Clientes criados: ${created}.`);
}
