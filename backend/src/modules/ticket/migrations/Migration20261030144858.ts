import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261030144858 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "ticket" add column if not exists "sent_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "ticket" drop column if exists "sent_at";`);
  }

}
