import "server-only";
import { Pool } from "pg";

// One shared connection pool per server process.
// Reused across hot reloads in development so we don't leak connections.
const globalForDb = globalThis as unknown as { thunderPool?: Pool };

// Supabase's Transaction pooler (port 6543) shares a few database connections among many clients, which hosts
// like Netlify need: they run several copies of the app at once and would use up the Session pooler's 15.
// It doesn't accept startup options, so there we rely on public being the default search path.
const transactionPooler = /:6543\//.test(process.env.DATABASE_URL ?? "");

export const db =
  globalForDb.thunderPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // Tables are in public, locked with row level security (see db/migrations/003_lock_tables.sql).
    ...(transactionPooler ? {} : { options: "-c search_path=public" }),
    max: transactionPooler ? 3 : 5,
    // Hand idle connections back quickly so other copies of the app can use them.
    idleTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.thunderPool = db;
