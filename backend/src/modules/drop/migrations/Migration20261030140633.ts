import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261030140633 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "drop" drop constraint if exists "drop_handle_unique";`);
    this.addSql(`create table if not exists "drop" ("id" text not null, "handle" text not null, "title" text not null, "subtitle" text null, "is_current" boolean not null default false, "preorder_starts_at" timestamptz not null, "preorder_ends_at" timestamptz not null, "general_starts_at" timestamptz null, "general_ends_at" timestamptz not null, "general_lot" integer null, "closed_at" timestamptz null, "production_days" integer not null default 21, "component_key" text null, "hero_kind" text check ("hero_kind" in ('community_video', 'drop_video', 'banner')) not null default 'banner', "hero_url" text null, "cover_url" text null, "instagram_url" text null, "whatsapp_url" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "drop_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_drop_handle_unique" ON "drop" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_drop_deleted_at" ON "drop" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "drop" cascade;`);
  }

}
