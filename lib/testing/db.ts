// Test-only: a throwaway schema with all migrations applied, dropped when the test file ends.
import pg from "pg";
import { randomBytes } from "node:crypto";
import { migrate } from "../../scripts/migrate";

export async function createTestDb() {
  const schema = `app_test_${randomBytes(4).toString("hex")}`;
  const config = { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } };

  const setup = new pg.Client(config);
  await setup.connect();
  await migrate(setup, schema);
  await setup.end();

  const pool = new pg.Pool({ ...config, options: `-c search_path=${schema}`, max: 4 });

  return {
    pool,
    async reset() {
      const r = await pool.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = $1 and tablename <> 'schema_migrations'",
        [schema],
      );
      if (r.rows.length) await pool.query(`truncate ${r.rows.map((t) => t.tablename).join(", ")} cascade`);
    },
    async drop() {
      await pool.query(`drop schema ${schema} cascade`);
      await pool.end();
    },
  };
}

// A clock the tests can move forward.
export function testClock(start = "2026-11-02T17:00:00Z") {
  let t = new Date(start).getTime();
  return {
    now: () => new Date(t),
    advanceMinutes: (m: number) => {
      t += m * 60_000;
    },
  };
}

// Captures emails instead of sending them.
export function testMailer() {
  const sent: { to: string; subject: string; text: string }[] = [];
  return {
    sent,
    sendEmail: async (to: string, subject: string, text: string) => {
      sent.push({ to, subject, text });
    },
    lastCode(): string {
      const m = sent.at(-1)?.text.match(/\b(\d{6})\b/);
      if (!m) throw new Error("No code emailed");
      return m[1];
    },
  };
}
