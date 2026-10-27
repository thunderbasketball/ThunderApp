// Stand-in for the Director's Users tab (Phase 3), for setting up test accounts.
//   npm run user -- list
//   npm run user -- add <cell> <first> <last> [email]   (starter PIN 1234, Coach role)
//   npm run user -- director <cell>                       (give Director role, clear request)
//   npm run user -- delete <cell>
import pg from "pg";

const [cmd, ...args] = process.argv.slice(2);
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  options: "-c search_path=public",
});

function cellArg(v: string | undefined): string {
  const d = (v ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (d.length !== 10) throw new Error("Give a 10-digit cell number.");
  return d;
}

await client.connect();
try {
  if (cmd === "list") {
    const r = await client.query(
      `select coach_id, first_name, last_name, cell, email, verified_email, active,
              thunder_request as request, thunder_coach as coach, thunder_director as director
       from users order by last_name, first_name`,
    );
    console.table(r.rows);
  } else if (cmd === "add") {
    const [cellIn, first, last, email] = args;
    if (!first || !last) throw new Error("Usage: add <cell> <first> <last> [email]");
    const cell = cellArg(cellIn);
    await client.query(
      `insert into users (coach_id, first_name, last_name, cell, email, thunder_coach) values ($1, $2, $3, $4, $5, true)`,
      [cell.slice(-7), first, last, cell, email?.toLowerCase() ?? null],
    );
    console.log(`Added ${first} ${last} with starter PIN 1234.`);
  } else if (cmd === "director") {
    const r = await client.query(
      "update users set thunder_director = true, thunder_request = false, updated_at = now() where cell = $1",
      [cellArg(args[0])],
    );
    console.log(r.rowCount ? "Director role granted." : "No user with that number.");
  } else if (cmd === "delete") {
    const r = await client.query("delete from users where cell = $1", [cellArg(args[0])]);
    console.log(r.rowCount ? "Deleted." : "No user with that number.");
  } else {
    console.log("Commands: list | add <cell> <first> <last> [email] | director <cell> | delete <cell>");
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await client.end();
}
