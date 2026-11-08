import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261108120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "email_view" ("id" text not null, "notification_id" text not null, "first_viewed_at" timestamptz not null, "last_viewed_at" timestamptz not null, "view_count" integer not null default 1, "last_ip" text null, "last_user_agent" text null, "country" text null, "city" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "email_view_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_view_notification_id_unique" ON "email_view" ("notification_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_email_view_deleted_at" ON "email_view" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "email_view" cascade;`);
  }

}
