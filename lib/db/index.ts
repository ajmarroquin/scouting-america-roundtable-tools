import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// DATABASE_URL is Neon's pooled connection string, set by the Vercel integration.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

// Lets Vercel close idle connections before a function instance is suspended.
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });
