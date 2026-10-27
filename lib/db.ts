import "server-only";
import { Pool } from "pg";

// One shared connection pool per server process.
// Reused across hot reloads in development so we don't leak connections.
const globalForDb = globalThis as unknown as { thunderPool?: Pool };

export const db =
  globalForDb.thunderPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // Tables are in public, locked with row level security (see db/migrations/003_lock_tables.sql).
    options: "-c search_path=public",
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForDb.thunderPool = db;
