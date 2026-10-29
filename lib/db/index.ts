import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { databaseUrl } from "./url";

// Neon's pooled connection string, set by the Vercel integration. Preview
// deployments get a separate database or none; see ./url.ts. Without a URL,
// pg would fall back to the PG* variables (which the integration also sets),
// so point it at an address that can't resolve instead.
const pool = new Pool({
  connectionString: databaseUrl(process.env) ?? "postgres://no-database-configured.invalid/none",
  max: 5,
});

// Lets Vercel close idle connections before a function instance is suspended.
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
