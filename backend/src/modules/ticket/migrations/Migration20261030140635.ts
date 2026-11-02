import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261030140635 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "ticket" drop constraint if exists "ticket_drop_id_lead_id_unique";`);
    this.addSql(`alter table if exists "ticket" drop constraint if exists "ticket_code_unique";`);
    this.addSql(`alter table if exists "access_link" drop constraint if exists "access_link_slug_unique";`);
    this.addSql(`create table if not exists "access_link" ("id" text not null, "drop_id" text not null, "slug" text not null, "slots" integer null, "used" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "access_link_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_access_link_slug_unique" ON "access_link" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_access_link_deleted_at" ON "access_link" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ticket" ("id" text not null, "drop_id" text not null, "lead_id" text not null, "customer_id" text null, "code" text not null, "source" text check ("source" in ('liberado', 'link', 'manual')) not null default 'liberado', "access_link_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ticket_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ticket_code_unique" ON "ticket" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ticket_deleted_at" ON "ticket" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ticket_drop_id_lead_id_unique" ON "ticket" ("drop_id", "lead_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "access_link" cascade;`);

    this.addSql(`drop table if exists "ticket" cascade;`);
  }

}
