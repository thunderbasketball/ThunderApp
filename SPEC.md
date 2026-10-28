# Thunder Basketball App — Spec

A rebuild of the current Google Apps Script + Sheets app as a standalone web app.
Same features, same rules. This file is the source of truth for behavior.

## Decisions

| Topic | Decision |
|---|---|
| Stack | Next.js (App Router, TypeScript) + Supabase (Postgres) |
| Hosting | Local development for now (Mac). Hosting decided later (Vercel was the candidate). |
| Email | Resend, sending from the thunderbball.org domain |
| MasterAuth Sheet | Import existing users once. Two-way sync until go-live (Scenic City also uses it), then the app is the only source |
| Migration | Migrate everything: users, teams + staff, gyms/courts/slots/bookings/blackouts, evaluations, Interested marks, rosters, registrations |

## Open questions (decide before the phase that needs them)

1. **PIN storage vs. two-way sync.** *Decided (Oct 28, 2026):* two-way sync with MasterAuth runs **only until this app goes live**; then the sync stops and the app is the only source. Existing users are imported from MasterAuth once. All new users are created in the app. Until go-live, PINs follow option (a): the app stores only a hash and writes the plain PIN to the Sheet when it changes, so Scenic City keeps working.
2. **Who wins when both sides change the same user?** Proposed: most recent change wins, by timestamp, field by field. *Needed before: Phase 2.*
3. **Weekend slots.** The booking week is Mon–Fri. Do Sat/Sun slots count toward a week, and which one? *Needed before: Phase 5.*
4. **Director bookings.** Is the Director limited by the team booking limits when booking for a team? Proposed: no. *Needed before: Phase 5.*
5. **Evaluation fields.** List the exact fields on an evaluation card (e.g. shooting, defense, notes) and their type (1–5 score, text). *Needed before: Phase 6.*
6. **Registration eligibility.** Which TeamSnap columns give grade and gender, and how is "eligible for a team's grades" matched (grade only, or grade + gender)? *Needed before: Phase 6.*

---

## 1. Users & login (build and test first)

### Identity
- Login is a 10-digit cell number + a 4-digit PIN. No passwords, no usernames.
- **CoachID** = last 7 digits of the cell. Check for duplicates when creating a user; refuse a cell whose last 7 digits match an existing user.
- Phone input: strip everything but digits; drop a leading `1` if 11 digits; must be exactly 10 digits.

### User record
| Field | Notes |
|---|---|
| CoachID | Last 7 digits of Cell. Unique. |
| FirstName, LastName | Required |
| Active | Boolean |
| PIN | 4 digits. Hashed in the database (see Open Question 1 for the Sheet). |
| Cell | 10 digits |
| Email | Current email |
| VerifiedEmail | The email that passed a code check |
| ThunderRequest | Boolean — access request pending |
| ThunderCoach | Boolean |
| ThunderDirector | Boolean |
| ScenicCityRequest, ScenicCityCoach, ScenicCityDirector, ScenicCityAssociations | Scenic City only. This app **never writes** these. Sync must keep them as they are. |

- Email is **verified** only when `Email = VerifiedEmail` (case-insensitive, trimmed). A verified email is **required** to log in.

### Login flow
1. **Enter phone.**
   - Unknown number → **Create Account**: first name, last name, email, choose PIN (entered twice, not 1234) → a 6-digit code is emailed → enter the code → account created with `VerifiedEmail = Email`, `ThunderRequest = true`, `Active = true` → message: "Request pending. The Director will review it."
   - Inactive → "Account deactivated."
   - ThunderRequest is set and no Thunder role yet → "Still pending."
2. **Starter PIN (1234).** Skip the PIN step.
   - Email on file → immediately send a code to **that address only** (the user can't change it here).
   - No email on file → ask for an email, then send the code.
   - Show **Set Your PIN**: code + new PIN typed twice (can't be 1234) → logged in. If the email was new, it is saved as verified.
3. **Normal PIN.** Enter the PIN; it auto-submits at 4 digits.
   - 5 wrong tries → that cell number is locked for 15 minutes. The message points to **Forgot PIN?**
4. **Correct PIN, email not verified** → send a code to the email on file, or "Use a different email" → enter code → email saved as verified → logged in.
5. **Forgot PIN?** (on the PIN step) → code goes **only** to the verified email → code + new PIN (twice, not 1234) → logged in, and the lockout is cleared. No verified email → "Please contact the Director."
6. **Correct PIN, verified, but no Thunder role** → show **Request Access** button (sets ThunderRequest).

### Email codes
- 6 digits, expire after 15 minutes.
- Max 3 code emails per hour per person (per cell number).
- Max 5 wrong tries per code; then the code is dead and a new one is needed.
- **Nothing is saved until the code checks out** (no account, no PIN change, no email change).
- Codes are stored hashed, single use.

### Sessions
- The browser stores a random device ID (long random token, httpOnly secure cookie).
- The server keeps the session for 6 hours.
- **Roles are re-read from the user record on every request.** Removing a role, or deactivating a user, takes effect on the next click.
- Logout deletes the session on the server.

## 2. Roles

- **Director** — from the user record (ThunderDirector). Sees everything; manages users, teams, gyms, rosters.
- **Per-team roles** — from each team's staff list: HeadCoach, AsstCoach, Manager, TeamParent. One person can hold different roles on different teams.

| Role | Edit staff | Book practices | Evaluations | View |
|---|---|---|---|---|
| Director | ✓ (all teams) | ✓ | ✓ | ✓ |
| HeadCoach | ✓ | ✓ | ✓ | ✓ |
| AsstCoach | | ✓ | ✓ | ✓ |
| Manager | | ✓ | | ✓ |
| TeamParent | | | | ✓ |

- A user with ThunderCoach but no team staff entries sees an empty "no teams yet" view.

### Header
- Sticky top bar: user's name, and one chip per role/team they hold (e.g. "Director", "4G Epps · HeadCoach"). One click switches context. The last chip used is remembered.
- Director context shows tabs: **Teams, Users, Practice, Players, Map**.
- When the Director picks a team chip, they see that team exactly as a coach would (no roster controls).

## 3. Teams

- Name format: grade + gender + head coach's last name, e.g. "4G Epps". A multi-grade team uses its top grade (e.g. "8G Black" for 7th–8th). Names are unique.
- Fields: name, allowed grades (one or more), gender, level (REC or COMP), staff list (user + role), created by.
- **Create team** (Director): pick gender, grades, level, and a head coach. The head coach is an app user or a registration volunteer (parent who offered to coach). Picking a volunteer creates their login (starter PIN 1234, Coach role) from their registration cell and email; refused if their cell's last 7 digits match another user. Becoming a head coach grants the Coach role.
- The 14 teams in the sheet's Teams tab are imported once (with a dry run first).
- **Edit team** (Director): gender, grades, level, practice locations. The name follows the grades, gender and head coach; refused if the new name is taken.
- **Staff** (Director, or the team's head coach for non-head roles): add from app users, registration volunteers, or a new person (name, cell, email). A cell already in the app uses that person; otherwise they get a login (starter PIN 1234). Adding a head coach replaces the current one and renames the team. Remove staff. Who added each person is recorded.
- Any team staff role counts as a Thunder role for login. HeadCoach and AsstCoach also set ThunderCoach.
- **Team dashboard**: staff, upcoming scheduled practices, players this team marked Interested, rostered players.
- HeadCoach and Director can edit staff.

## 4. Practice scheduling

### Slots
- Fields: Gym, Court, Time (date + start time), Available, Team, Booked By. Practices are 60 minutes.
- A slot is identified by **Gym + Court + Time**, never by row/position.
- A slot is *completed* once its start time + 60 minutes has passed. *Upcoming* = not completed.

### Display
- Grouped by Date, then by Gym, sorted by Time.
- Coaches see only available slots (plus their own team's bookings). The Director sees everything.

### Booking
- Booking stores Team (e.g. "4G Epps") and Booked By (the person's name, taken from the server session).
- Option: "Book this same slot every future week where it's available." Each week is checked against the limits on its own; report which weeks booked and which didn't.
- Release a booking, with the same "every future week" option.
- **Blackouts** (Director only): Team = "BLACKOUT", Booked By = Director's name. Blackouts don't count toward any team's limits.

### Booking limits (per team, per Mon–Fri week)
Let *N* = the team's upcoming practices in the week of the slot being booked.
- N = 0 → allowed.
- N = 1 → allowed **only if** the new slot starts within 72 hours from now (the "extra").
- N ≥ 2 → refused.

Example: Team has Thu 6PM. Mon 6PM is within 72h → can add it (N=1). Once Mon is done, N=1 again → can add Tue 6PM if within 72h. While holding Thu + Tue (N=2), can't add Mon without releasing one.

- Enforced on the server inside a transaction. The UI uses the same rule to show messages ahead of time.

### Gyms
- Director can add a gym, set the number of courts, and name each court.
- "Approved Practice Locations" = checkbox list of unique gyms (used to choose which gyms a team or the schedule shows).

## 5. Evaluations & rosters

- Coaches (HeadCoach, AsstCoach, Director-as-coach) evaluate registered players eligible for their team's grades.
- One card per player: name, grade, evaluation fields (see Open Question 5), and an **Interested** checkbox.
- Under each player's name and grade: pills showing which teams marked Interested and which team rostered them.
- **Only the Director can roster**, from the Director view: one checkbox per eligible team. A player can be on only one team (checking a second team is refused until the first is unchecked).
- Roster record: Player, Grade, Gender, Team, Rostered By, Date.
- Coaches can mark Interested but never roster.

## 6. Director tools

- **Users**: list (sorted by last name), add a user (name, cell, email), set roles, approve pending requests. Granting any Thunder role clears ThunderRequest. A Director can't remove their own Director role.
- **Players**: all registered players grouped by Gender, then Grade, sorted by Last Name, with Interested/Rostered team pills.
- **Map**: a flowchart page showing how the parts of the system connect.
- **TeamSnap import**: upload the TeamSnap CSV export.
  - Match headers robustly (case, spaces, punctuation, known aliases).
  - Parse birthdates in common formats; handle grad year → grade.
  - Validate the whole file **before** clearing old registrations. If anything fails, nothing changes; show the row-level errors.
  - Import replaces registrations in one transaction. Don't touch unrelated scheduled jobs.

## 7. MasterAuth sync (two-way)

- Supabase is the app's working database; the MasterAuth Sheet stays in step with it.
- **App → Sheet**: on any user change (create, PIN, email, Thunder roles, Active), write that user's row to the Sheet, matched by CoachID. Only Thunder-owned and shared columns are written. Scenic City columns are never written.
- **Sheet → App**: a scheduled job (every few minutes) reads the Sheet and applies changes made by Scenic City or by hand.
- Conflict rule: see Open Question 2.
- Writing to the Sheet guards against formula injection (any text starting with `= + - @` is prefixed with `'`).
- Sync failures are logged and retried; they never block a login.

## 8. Migration

One-time import from the current Sheets into Supabase: users, teams + staff, gyms/courts, slots (bookings and blackouts), evaluations, Interested marks, rosters, registrations. Run as a script with a dry run that prints counts and problems first.

## 9. Security (non-negotiable)

- Every server endpoint checks the session and role on the server. Never trust the browser for role, team, name, or Director status.
- Escape all user text before rendering it as HTML (React does this by default; never use raw HTML injection with user data).
- Validate all input on the server.
- Guard against formula injection on anything written to Sheets or exported as CSV.
- Writes are atomic (database transactions / row locks) so two people booking at once can't collide.
- Rate-limit code emails and PIN attempts exactly as in Section 1.
- PINs and codes are hashed. Supabase service key lives only on the server.

## 10. General UI rules

- Mobile-first. Coaches use this on their phones. Keep pages fast and light.
- Every list or table is sorted.
- "Who did it" is recorded: Booked By, Rostered By, and timestamps.
