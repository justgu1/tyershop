import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261103120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "melhor_envio_token" ("id" text not null, "access_token" text not null, "refresh_token" text not null, "expires_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "melhor_envio_token_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_melhor_envio_token_deleted_at" ON "melhor_envio_token" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "melhor_envio_token" cascade;`);
  }

}
