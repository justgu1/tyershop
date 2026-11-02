import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261102120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "ticket" add column if not exists "redeemed_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "ticket" drop column if exists "redeemed_at";`);
  }

}
