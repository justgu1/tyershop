import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261030140634 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "lead" drop constraint if exists "lead_email_unique";`);
    this.addSql(`create table if not exists "lead" ("id" text not null, "email" text not null, "name" text null, "status" text check ("status" in ('pendente', 'liberado', 'inativo', 'negado')) not null default 'pendente', "source" text not null default 'manual', "customer_id" text null, "missed_drops" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "lead_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_lead_email_unique" ON "lead" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_lead_deleted_at" ON "lead" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "lead" cascade;`);
  }

}
