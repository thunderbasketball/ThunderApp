# Thunder Basketball App

Web app for Thunder Basketball (youth basketball). Rebuild of the Google Apps Script + Sheets version.
**SPEC.md is the source of truth for behavior.** Read it before changing features.

Stack: Next.js + Supabase (Postgres), email via Resend. Built and run locally for now; hosting decided later.
Secrets live only in `.env.local` (never committed, never pasted into chat). Two-way sync with the MasterAuth Google Sheet (shared with the Scenic City app).

@AGENTS.md

## Commands
- `npm run dev` — run locally at http://localhost:3000
- `npm test` — run tests (Vitest; tests live next to code as `*.test.ts`)
- `npx tsc --noEmit` and `npm run lint` — type check and lint
- `npm run db:migrate` — apply new `db/migrations/*.sql` files
- `npm run user -- list | add <cell> <first> <last> [email] | director <cell> | delete <cell>` — test accounts until the Users tab exists
- `npm run import:teamsnap -- "data/import/<file>.csv" [--dry-run]` — replace registrations from a TeamSnap export (all columns kept; birthdates shifted +1 day when TeamSnap shows an evening time)
- `data/` holds real exports with personal info: gitignored, never commit or paste it
- Database access is server-only via `lib/db.ts` (pg pool on `DATABASE_URL`, Supabase Session pooler).
  Tables live in the private `app` schema (not exposed by Supabase's API). Tests run in a throwaway `app_test_*` schema.
- Business rules live in plain functions (e.g. `lib/auth/service.ts`) that take `deps` (pool, email, clock) so tests can drive them; server actions in `app/**/actions.ts` are thin wrappers.
- Without Resend keys, emails (and their codes) print in the `npm run dev` terminal.

## How I like to work
- Work one step at a time. After each change, tell me exactly how to test it, then wait for my OK.
- Write tests for the login flow and the booking limits. Run them before telling me something works.
- Keep explanations short and plain. I'm the organization's director, not a full-time developer.
- Mobile-first: coaches use this on their phones. Keep it fast.
- Any sheet or table the app shows stays sorted, with who did it recorded (Booked By, Rostered By).

## Non-negotiable rules
- Every server endpoint checks the session and role on the server. Never trust the browser for role, team, name, or Director status.
- Roles are re-read from the user record on every request.
- Escape all user text before rendering it as HTML.
- Validate all input on the server. Guard against formula injection (`= + - @`) on anything written to Sheets or CSV.
- Writes that can collide (bookings, rosters, codes, PIN tries) run in a transaction.
- Never write the Scenic City columns (ScenicCityRequest, ScenicCityCoach, ScenicCityDirector, ScenicCityAssociations).
- Find practice slots by Gym + Court + Time, never by position.
