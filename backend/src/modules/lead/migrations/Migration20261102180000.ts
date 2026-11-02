import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261102180000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "lead" drop constraint if exists "lead_status_check";`);
    this.addSql(`alter table if exists "lead" add constraint "lead_status_check" check ("status" in ('pendente', 'liberado', 'inativo', 'negado', 'descadastrado'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "lead" drop constraint if exists "lead_status_check";`);
    this.addSql(`alter table if exists "lead" add constraint "lead_status_check" check ("status" in ('pendente', 'liberado', 'inativo', 'negado'));`);
  }

}
