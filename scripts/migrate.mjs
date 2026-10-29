// Applies pending migrations in ./drizzle.
//
// Runs during `npm run build` only when RUN_MIGRATIONS=true, which is set for
// Vercel's Production environment and nowhere else. Preview builds never touch
// the production schema. Locally, `npm run db:migrate` passes --now.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const requested = process.argv.includes("--now") || process.env.RUN_MIGRATIONS?.trim() === "true";
if (!requested) {
  console.log("migrate: skipped (RUN_MIGRATIONS is not true)");
  process.exit(0);
}

// Same rule as lib/db/url.ts: previews never touch the production database.
const url =
  process.env.VERCEL_ENV === "preview"
    ? process.env.PREVIEW_DATABASE_URL
    : process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error(
    "migrate: no database configured. Add Neon from the Vercel project's Storage tab " +
      "(Production environment), then redeploy. Or unset RUN_MIGRATIONS.",
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("migrate: done");
} finally {
  await client.end();
}
