<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules

- The repo is public. Never commit real member data, exports, screenshots of real records, or secrets. `tests/fixtures/` holds synthetic data only.
- Never import youth records. Youth are added by hand, with a parent or guardian email.
- All database access goes through `lib/db` on the server. Every server action and route handler checks the caller with `requireUser()` or `requireRole()` from `lib/auth/session.ts`.
- Session reads must sit inside a `<Suspense>` boundary (Cache Components is on).
- Schema changes: edit `lib/db/schema.ts`, run `npm run db:generate`, commit the SQL in `drizzle/`. Production applies it during the build.
- Before pushing: `npm run lint && npm run typecheck && npm test && npm run build`. Set `TEST_DATABASE_URL` to a local throwaway Postgres to also run the database tests (`*.db.test.ts`); they drop and rebuild its schema.
- See `docs/PLAN.md` for scope and `docs/SETUP.md` for hosting.
