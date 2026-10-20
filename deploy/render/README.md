# Render + Supabase migration

The existing local and Cloudflare paths are retained. Set DEPLOY_TARGET=render only for the Node deployment.

1. Create a **new Free Supabase project**. Run `schema.sql` once in its SQL editor. It contains structure only, no local feedback. Application tables have RLS enabled and no browser grants. Do not apply to an existing populated project.
2. Use Supabase's session pooler parameters as Render's `PGHOST`, `PGUSER`, `PGDATABASE`, `PGPORT` and secret `PGPASSWORD` (or use a server-only `DATABASE_URL`). Never commit it or expose it to the browser. The database connection is server-only and limited to three connections.
3. Deploy using `render.yaml`, plan **free**, build `pnpm build:render`, start `pnpm start:render`. `/api/health` checks database connectivity.
4. Optional attachments: create a **private** `feedback-files` storage bucket. Configure server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `SUPABASE_STORAGE_BUCKET`. The key must never use a NEXT_PUBLIC prefix or enter source control.
5. The initial Render deployment is public **read-only**, using owner `firefly-public`. All mutation APIs reject unauthenticated writes. Editing/review remains local until administrator sign-in is implemented. Existing local data and attachment bytes are not migrated automatically.

Validation: `node tests/postgres.mjs`, `node node_modules/typescript/bin/tsc --noEmit`, `pnpm build:render`.

## Deployment preparation (2026-10-20)

Private repository: https://github.com/elio-chen0322/firefly-feedback
Supabase project: `ncisftxvcuwubfufsjbr` (`firefly-feedback`). The 11 application tables were created and verified in the SQL editor. Render creation form is prepared with the Free plan; the owner must enter the database password directly into Render. No password is stored in this repository.

## fy-peo team deployment (2026-10-20)

Target private repository: https://github.com/elio-chen0322/fy-peo

The Node deployment now requires Supabase email/password authentication for every data operation. Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and comma-separated `TEAM_EMAILS`. Only verified emails in this allowlist can access the workspace. All members use the shared `PUBLIC_DATA_OWNER` data space; audit actors retain their email. No public sign-up page is provided. Invite members through Supabase Auth and let them set their own passwords. Sessions expire after at most one hour; sign in again at `/login`.

This supersedes the read-only Node behavior described above. Local Cloudflare development behavior is retained. The existing Supabase project already has its application schema according to the earlier preparation notes; verify it before any data migration, and do not rerun the create-only schema on populated tables.

Set `PGPASSWORD` directly in Render; never commit credentials. Optional attachments additionally require a private bucket and server-only storage credentials as described above. Set Render's deployment trigger to manual if each release must be explicitly started. Uploading source alone does not update online data.

Do not commit local SQLite files, user imports, Excel exports, or `.env` files. Existing local records have not been migrated. Use the authenticated import flow after the live environment is verified, and reconcile record counts before inviting the team to test.

Render currently displays an Add Card verification modal on this account. The owner must complete this step before a live service can be created. No working deployment URL has been verified.
