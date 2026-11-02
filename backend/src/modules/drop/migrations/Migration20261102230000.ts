import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261102230000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "drop" add column if not exists "release_leads_in_presale" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "drop" drop column if exists "release_leads_in_presale";`);
  }

}
