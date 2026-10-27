import type { Pool } from "pg";
import { withTx } from "../sql";
import type { ParseResult } from "./parse";

// Replaces all registrations in one transaction. Refuses if the file had errors,
// so a bad file never clears the old data.
export async function importRegistrations(
  pool: Pool,
  parsed: ParseResult,
  importedBy: string,
  now: Date,
): Promise<{ imported: number }> {
  if (parsed.errors.length) throw new Error(`File has ${parsed.errors.length} error(s); nothing was changed.`);
  if (!parsed.players.length) throw new Error("No players in the file; nothing was changed.");
  const rows = parsed.players.map((p) => ({ ...p, imported_at: now.toISOString(), imported_by: importedBy }));
  return withTx(pool, async (q) => {
    await q.query("delete from registrations");
    const r = await q.query("insert into registrations select * from jsonb_populate_recordset(null::registrations, $1)", [
      JSON.stringify(rows),
    ]);
    return { imported: r.rowCount ?? 0 };
  });
}
