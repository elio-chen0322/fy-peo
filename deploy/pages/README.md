# GitHub Pages + Supabase

This is the active deployment target. Render is not required.

1. Existing business schema: `deploy/render/schema.sql` (new databases only). On the existing project verify the tables before running any migration.
2. Apply the additive `deploy/supabase/membership.sql` migration. It creates an administrator-managed membership table and a private attachment bucket, without changing business records.
3. `pnpm build:edge` bundles existing API handlers into `supabase/functions/peo-api/index.js`. Deploy this function to project `ncisftxvcuwubfufsjbr`. Gateway JWT checks are disabled because the handler verifies the user token with Supabase Auth and then checks `peo_members` on every request. The function uses the platform-provided database URL and service-role key; they never enter the browser.
4. The frontend's publishable project key is in `deploy/pages/config.ts`. Browser access to business tables remains revoked. `pnpm build:pages` outputs static files to `dist-pages` with `/fy-peo/` as the base path.
5. Enable GitHub Pages using GitHub Actions, then run “Publish PEO test site” manually. A private repository requires an eligible GitHub plan for Pages; do not change visibility without the owner's approval.
6. Create member accounts through Supabase Auth. Members set their own passwords and verify their email. Add their user ID and email to `peo_members` using the commented administrator query. Do not grant every signed-up user access automatically.
7. Local records are not included in the repository or static assets. Migrate them separately, reconcile table counts, and retain a local backup before using the site for team review.

## Verification

`node node_modules/typescript/bin/tsc --noEmit`

`pnpm build:edge && node tests/edge.mjs`

`pnpm build:pages`

The API test uses PostgreSQL in memory and checks allowed origins, membership, create/read/edit, stale revision rejection, batch import, voice archive and cycle report reads. It does not prove the live Supabase connection works. Verify live login, attachment upload/download and Excel round trips after deployment.

## Shared data behavior

All approved members use the `firefly-public` workspace. Saves go to the shared database; other members use “刷新共享数据” or reopen a view to fetch changes. There is no background live subscription. Existing revision checks prevent stale feedback writes from overwriting newer edits. Review paths retain their existing conflict behavior.

Browser sessions are held in the current tab's session storage and refresh before expiry. Closing the tab clears them. “退出登录” clears the session and requests token revocation. No service or database secrets are committed.
