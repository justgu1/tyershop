import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261111150000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "email_bounce" ("id" text not null, "notification_id" text not null, "message_id" text not null, "recipient" text null, "status_code" text null, "reason" text not null, "diagnostic" text null, "bounced_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "email_bounce_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_bounce_notification_id_unique" ON "email_bounce" ("notification_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_email_bounce_deleted_at" ON "email_bounce" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "email_bounce" cascade;`);
  }

}
