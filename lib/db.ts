import "server-only";
import { Pool } from "pg";

// One shared connection pool per server process.
// Reused across hot reloads in development so we don't leak connections.
const globalForDb = globalThis as unknown as { appPool?: Pool };

export const db =
  globalForDb.appPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // App tables live in the private "app" schema, which Supabase's public API doesn't expose.
    options: "-c search_path=app",
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForDb.appPool = db;
