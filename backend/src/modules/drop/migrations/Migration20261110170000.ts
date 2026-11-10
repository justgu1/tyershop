import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261110170000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "drop" add column if not exists "sell_until_sold_out" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "drop" drop column if exists "sell_until_sold_out";`);
  }

}
