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
3. **Weekend slots.** *Decided:* there are no weekend slots today; weeks are counted Monday 00:00 to the next Monday (Eastern), so a weekend slot would count with the Mon–Fri before it. Revisit if weekend slots are added.
4. **Director bookings.** *Decided:* the Director is exempt from team limits (the app warns when a team goes over).
5. **Evaluation fields.** *Decided:* same as the Sheet's Evaluations tab: Position (Guard/Wing/Post), Height (Short/Average/Tall), Speed (Slow/Average/Fast), Score 1–5, Notes (up to 1000 characters), Interested (the Sheet's Pickup).
6. **Registration eligibility.** *Decided:* TeamSnap gives gender and grade (see section 1 import). Evaluations: same gender, the team's grade(s) or one grade below.

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

**For now (until go-live): PIN only.** With `LOGIN_PIN_ONLY=true` in `.env.local`, a person who has chosen their own PIN logs straight in with it: phone → PIN → logged in, even if their email isn't verified. Starter PIN 1234 (or no PIN stored, which is how the import saves 1234) still goes through step 2: email code → Set Your PIN. Wrong-PIN lockout, Active, and pending-request rules still apply. Create Account still verifies the email with a code. Forgot PIN → "Please contact the Director to reset your PIN." Turn this off at go-live to bring back email verification for everyone.

### Email codes
- 6 digits, expire after 15 minutes.
- Max 3 code emails per hour per person (per cell number).
- Max 5 wrong tries per code; then the code is dead and a new one is needed.
- **Nothing is saved until the code checks out** (no account, no PIN change, no email change).
- Codes are stored hashed, single use.

### Sessions
- The browser stores a random device ID (long random token, httpOnly secure cookie).
- The server keeps the session (device ID + login time) for 24 hours from the PIN login. Opening the app on the same device within that time logs straight in; after it, the PIN is asked again.
- **Roles are re-read from the user record on every request.** Removing a role, or deactivating a user, takes effect on the next click.
- Logout deletes the session on the server and the device ID cookie, so the next visit needs the PIN.
- **Act as** (Director): a **👁** button on each person's card (Users, Coaches, and a team page's staff; not on yourself) shows the whole app as that person sees it (their roles, teams, inbox), **view only**: every save is refused ("You're viewing the app as someone else…"), and opening their inbox doesn't mark anything read. An orange bar at the top shows who you're viewing as, with **Stop** (back to Users). Stored on the session and re-checked every request: it ends if you lose the Director role or they're deactivated; logout ends it.
- **Player 👁** (Director, Players page): players have no login, so it pops up the player's team: name, level, staff (role, name, cell), next 3 practices, and who rostered them, or **No Active Team Assigned**.

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
- **Team menu**: on a team chip (coaches, other staff, or the Director on their own team chip) the team page has a menu **Staff · Roster · Uniforms · Practices**: tabs under the header on a computer, a tab bar along the bottom on a phone. Staff = the team card and staff list; Roster = the rostered players, then (Head and Assistant Coaches) **Available players**: eligible players not on any team, by grade, each with a ☆/★ to mark this team's interest (saves at once) and **Evaluate**, which pops up that player's evaluation card; filters All / Not rated / ★ Interested, search when more than 8; Practices = booked practices and Book practices.
- **Director Uniforms** tab (`/uniforms`): every rostered player whose family ordered a uniform, grouped by team (Teams page order), as LAST NAME · number · size, with totals by size; names are jersey style (ALL CAPS but keeping prefixes like McCROBEY, MacDONALD, DeSHIELDS; no Jr/Sr/II/III or typed-in #number). View only: the team's coaches set them; anything not set yet shows a red —.
- **Uniforms** tab: every rostered player (by last name) with whether their family **ordered a uniform** at registration. The team's staff (any role) or a Director set a **number** for every player (0–99) and a **size** (YXS…AXL) for those who ordered; each change saves at once with who set it. The parent's requested size and number from registration show as a hint with **Use**, but count only once set. A number used twice on the team is allowed but warned on both players and at the top. While any player is missing a number (or a size, if they ordered), the **Uniforms** tab flashes red. A number like 07 is saved as 7 (0 and 00 stay different). A player's number and size on a team are cleared when they leave that team. Stored in `team_uniforms` (registrations are replaced on every sync).

## 3. Teams

- Name format: grade + gender + head coach's last name, e.g. "4G Epps". A multi-grade team uses its top grade (e.g. "8G Black" for 7th–8th). Names are unique.
- Fields: name, allowed grades (one or more), gender, level (REC or COMP), staff list (user + role), created by.
- **Create team** (Director): pick gender, grades, level, and a head coach. The head coach is an app user or a registration volunteer (parent who offered to coach). Picking a volunteer creates their login (starter PIN 1234, Coach role) from their registration cell and email; refused if their cell's last 7 digits match another user. Becoming a head coach grants the Coach role.
- The 14 teams in the sheet's Teams tab are imported once (with a dry run first).
- **Edit team** (Director): gender, grades, level, practice locations. The name follows the grades, gender and head coach; refused if the new name is taken.
- **Players (roster)** on each team page, sorted by last name, each with who rostered them. The Director adds registered players (**+ Add players**: players who fit the team's gender and grades first, "Show all" or search for anyone, and a note when a player is already on another team; adding such a player is refused, so a player is never on two teams; move them on Players → Roster players instead) and removes them (warning; past check-ins stay). The team's staff can see the roster but not change it. Names are copied when rostered; a player who later drops out of registrations stays, marked "no longer in registrations".
- **Teams list** (Director): each team card shows a **👥 count** of rostered players (tap it for a pop-up roster: name, grade, Rostered By, sorted by last name) and its staff as color-coded role circles (HC Head Coach, AC Assistant Coach, TM Team Manager, TP Team Parent) with just the name; tapping a name opens a contact card (cell, email, Call / Text / Email). **Text all coaches** opens the phone's Messages app with every head and assistant coach in one group text (nothing is sent by the app).
- **Staff** (Director, or the team's head coach for non-head roles): add from app users, registration volunteers, or a new person (name, cell, email). A cell already in the app uses that person; otherwise they get a login (starter PIN 1234). One person per role per team (one Head Coach, Assistant Coach, Manager, Team Parent); Add staff only offers open roles. Adding a head coach (Director) replaces the current one and renames the team; other roles must be removed first. Remove staff. Who added each person is recorded.
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
- Coaches see their practice gyms: open slots, which team has each booked slot (not who booked it) and blocked times. The Director sees everything, including who booked.

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

### Director tools (Practice tab)
- **Add gym**: name, number of courts (1–6), a name for each court.
- **Add practice slots**: gym, court (or all courts), From/To dates, days of the week, start times (8 AM–9 PM). 60-minute slots; existing ones are skipped; slots on blacked-out dates are added as blocked.
- **Blackout dates**: Block or Restore; gym (or all gyms), From/To, time (or all day), reason. Blocking removes team bookings in the range (red warning first) and reports which. Restoring part of a wider blackout keeps the rest blocked. Past slots are never changed. Blacked-out dates are kept (from the sheet's BlackOuts tab) so later slots on them come in blocked.
- **Yearly blackouts**: "Repeat every year" offers the choices that fit the chosen date (e.g. Nov 26 → "every Nov 26", "4th Thursday of November", "last Thursday of November"), keeping the number of days ("+ 1 day after"). Quick picks: Thanksgiving, Christmas, New Year's, MLK Day, Memorial Day, July 4th, Labor Day. Rules are filled in for this year through the later of two years ahead and the last slot, and again whenever slots are added. Removing a rule reopens its upcoming dates.
- Director links inside Practice: **Schedule** (week grid like the old Master Practice Schedule: a card per day, gym, times, one line per court with Release / Block / Unblock / Book), **Season** (calendar of every month with open/booked/blocked days; tap a day for its week), **Blackouts** (yearly rules + upcoming dates), **Gyms** (courts, upcoming slots, teams approved).
- **Team view** (team chip, or "Book practices" on the team page): the team's practice gyms, showing open slots, which teams practice in each slot (team name only, not who booked) and blocked times; the team's own practices stand out. A banner shows where the team stands this week. Each open slot shows Book, or "Limit reached" / "View only". The Director in a team's view follows the coach rules; the Director chip is exempt.
- Team pages list upcoming practices.

### Gyms
- Director can add a gym, set the number of courts, and name each court.
- "Approved Practice Locations" = checkbox list of unique gyms (used to choose which gyms a team or the schedule shows).

## 5. Evaluations & rosters

- Coaches (HeadCoach, AsstCoach, Director-as-coach) evaluate registered players eligible for their team: **same gender, the team's grade(s) or one grade below** (built: coaches use their team's **Roster** tab; the Director uses **Evaluate** on each player card on the Players page, which pops up a team picker (the teams that player can play for, their own team first, then Comp) and that team's card. The Director's view of a team page has no Evaluate button).
- One card per player per team: name, grade, evaluation fields (see Open Question 5), and an **Interested** toggle. Each tap saves at once (only the changed field, so two coaches don't undo each other); tapping a picked choice clears it; a card with everything blank is removed. Saved By + time shown.
- Each team sees **only its own** ratings; the Director sees every team's. A card stays if the player leaves registrations.
- Cards are grouped by grade (top grade first), then last name. Filters: All, Not rated, Interested; search by name.
- Import the Sheet's Evaluations tab with `npm run import:evaluations` (safe to re-run; existing cards left alone).
- Under each player's name and grade: pills showing which teams marked Interested and which team rostered them.
- **Only the Director can roster**, from the Director view: one checkbox per eligible team.
- **Roster players** (Players page, each gender + grade card) pops up a roster board: only the teams named for that grade (same gender; e.g. 1st grade → the 1B teams), COMP first, each showing its whole roster, and **Not on a team**: the players those teams can take who aren't on any team (that grade and one grade below, e.g. 1st and K; the lower grade marked). Each player shows their registration's coach request in small text under the name (nothing when there isn't one). Drag a player onto a team or back to Not on a team; on a phone, tap a player, then tap where they go. Moving a player off another team is part of the move (one transaction), so a player is never on two teams. Rostered By and date are recorded. A player can be on only one team (checking a second team is refused until the first is unchecked).
- Roster record: Player, Grade, Gender, Team, Rostered By, Date.
- Coaches can mark Interested but never roster.

## 6. Director tools

- **Coaches**: sections Volunteers (parents who offered to coach at registration, grouped by gender then grade, Head before Assistant, with their player), Current Head Coaches, Assistants, Managers, Team Parents (who holds that role on a team now, with their teams). Each person shows a role circle with the name (tap for the contact card). Each section has **Text all** (one group text) and a notify bell.
- **Users**: grouped like the old app (Access Requests, Active Directors, Active Coaches, Other active, Non-active; last two collapsed), each sorted by last name, with each person's team roles shown. **+ Add user** (name, cell, email, Coach/Director; starter PIN 1234). **Edit** (pop-up): name, email (a changed email must be re-verified at next login), Active, Coach, Director; approve as Coach or deny a request. Granting any Thunder role clears ThunderRequest. A Director can't remove their own Director role or deactivate themselves. **Reset login** (not for yourself, with a warning): PIN back to starter 1234, email cleared, logged out everywhere, PIN lockout cleared; at their next login they enter an email, confirm it with a code, and choose a new PIN. **Delete** only when the person isn't the viewer, isn't on any team, and isn't used by Scenic City; otherwise deactivate. Who last changed a user is recorded (updated_by). Cell/CoachID can't be edited.
- **Players**: all registered players grouped by Gender, then Grade, sorted by Last Name, with Interested/Rostered team pills.
- **Map**: a flowchart page showing how the parts of the system connect.
- **TeamSnap import**: upload the TeamSnap CSV export.
  - Match headers robustly (case, spaces, punctuation, known aliases).
  - Parse birthdates in common formats; handle grad year → grade.
  - Validate the whole file **before** clearing old registrations. If anything fails, nothing changes; show the row-level errors.
  - Import replaces registrations in one transaction. Don't touch unrelated scheduled jobs.

## 7. MasterAuth sync (two-way)

- Supabase is the app's working database; the MasterAuth Sheet stays in step with it.
- **App → Sheet** (built; `MASTERAUTH_SYNC=on` in `.env.local`, the sheet shared with the service account as **Editor**): a database trigger queues every change to a user (name, cell, email, VerifiedEmail, PIN, ThunderRequest/Coach/Director, new user, deleted user) in `masterauth_outbox`; every minute the server writes queued users to their row, matched by CoachID, only the cells that differ.
  - Written: FirstName, LastName, EmailAddress, VerifiedEmail, ThunderRequest, ThunderCoach, ThunderDirector, and PIN. **Never** written: Active on an existing row (shared with Scenic City; deactivating in Thunder doesn't block Scenic City), the Scenic City columns, ThunderAdmin, TempAuthCode, CodeExpiration, DeviceID, LastLogin.
  - **PIN**: the app only knows a PIN when someone sets it (Set Your PIN, Forgot PIN, Create Account). It's held encrypted (`MASTERAUTH_PIN_KEY`) until written, then deleted. After **Reset login** the sheet gets 1234. Otherwise the sheet's PIN is left alone. With the sync off, PINs aren't kept at all.
  - **New user**: a new row with CoachID, names, Active = TRUE, PIN (or 1234), CellNumber, email and Thunder roles; other columns left empty.
  - **Deleted user**: the row stays; ThunderRequest/Coach/Director set to FALSE.
  - Values are written RAW (never run as formulas); text starting with `= + - @` is prefixed with `'`. Right before writing, the CoachIDs of the rows are read again; if rows moved, nothing is written and it tries again.
  - A failure is retried (1, 2, 4… up to 60 minutes apart) and never blocks the app; the Users page shows a red note while it's failing.
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
- Director tabs (Teams, Practice, Events, Users, Players, Coaches): on phones, a tab bar fixed to the bottom of the screen with an icon and short label for each, all visible at once; on tablets and computers, a row of tabs under the header.

- Mobile-first. Coaches use this on their phones. Keep pages fast and light.
- Every list or table is sorted.
- "Who did it" is recorded: Booked By, Rostered By, and timestamps.

## 11. Announcements & messages

Built in steps: (1) announcements, (2) chats, (3) phone notifications (needs hosting on https).

### Announcements (built)
- The Director sends a one-way post (title up to 120 characters, message up to 4,000) to **Everyone**, **roles** (Directors, Coaches, Head Coaches, Assistant Coaches, Team Managers, Team Parents), **teams** (all their staff), and/or **people** by name. Picks combine. The compose screen shows how many people (and who) it will reach before sending, with a warning confirm.
- Recipients: active users with a Thunder role (Coach, Director, or on a team). Never the sender, inactive users, or pending requests. Fixed at send time.
- **New-announcement pop-up**: unread announcements under 24 hours old pop up the next time the person opens the app (any page), oldest first, and can only be closed with **Got it**, which marks them read. After 24 hours they no longer pop up, but stay in the inbox (and the 8-hour email still applies). Not shown while a Director is viewing as someone.
- Everyone has a bell in the header with an unread count. **Announcements** (the inbox) lists theirs newest first; opening it marks them read. Unread ones are outlined and tagged New.
- Director: **Sent** list with who it went to, "N of M read", and who hasn't read it yet. **Remove** (with a warning) takes it out of every inbox and cancels any reminder email not yet sent.
- **Unread for 8 hours → one summary email** (from no-reply) listing all their unread announcements that are 8+ hours old, with a link to the inbox. Each announcement is emailed at most once; each person gets at most one such email every 8 hours. Reading in the app stops it. People with no email are skipped. Checked every 15 minutes while the server runs. `APP_URL` in `.env.local` is the link in the email.

### Notify bells (Director)
An orange bell opens a short pop-up (title + message) already addressed to that spot's group, shows how many it reaches (and who), and sends after a warning confirm. Same announcement rules as above.
- **Header bell (Directors):** pops up a notify to all team staff (every Head, Assistant, Manager and Team Parent), with a **My announcements** link to their inbox. Coaches' bell opens their inbox.
- **Teams page:** "Notify everyone"; each team card notifies that team's staff.
- **Practice schedule:** each day that has practices booked notifies the staff of every team practicing that day.
- **Coaches page** (sections: Volunteers, Head, Assistants, Managers, Team Parents, each with a count): each section notifies its group. Current role sections list everyone holding that role on a team, with their teams.
- **Volunteers** who have an app login (matched by cell) get it in the app; those without one are emailed right away (once per address). The Sent list shows "also emailed N without an app login".

### Chat (built)
A chat bubble in the header (everyone with a role) shows unread chat messages. For coaches it opens **Chat**; for **Directors** it pops up their chat with all Head Coaches, with an **All chats** link to **Chat**. **Chat** is the person's chats, newest activity first, with the last message and an unread count. **+ New chat** lists what they can start; opening one that already has messages goes to it.

| Chat | Members | Who can start it |
|---|---|---|
| Directors | Directors | Directors |
| Directors & all coaches | Directors + every coach | Directors, coaches |
| Coaches | coaches (Directors can read and post, but get no unread counts or emails from it) | coaches |
| <team> · Team | that team's staff (all roles) + Directors | the team's staff, Directors |
| <team> · Coaches | that team's Head and Assistant Coaches + Directors | Directors, those coaches |
| <coach> · Directors | one coach + the Directors (the coach sees it as "Directors") | that coach, Directors |
| <event> · Event | the event's check-in people + Directors | from the event page (Directors, its check-in people) |
| <coach> (private) | one Director + one coach | that Director, from the coach's contact card |
| <team> · Staff | one Director + that team's staff (all roles) | that Director, from the team card |
| All Head Coaches | one Director + every Head Coach | that Director, from the header bubble |

The last three are started by one Director: only their members get unread counts and emails. Other Directors can still find, read and reply to them from **Chat**, but aren't alerted.

**Chat buttons** (blue chat icon) open a chat straight from where you are: a **team card** → a pop-up chat with that team's staff; the **💬 Chat** button on a coach's contact card → a pop-up private chat with that coach; a **user card** on Users (coaches only) → that coach's chat with the Directors; an **event** page → the event chat (players and parents have no logins, so it's for the people running it); a **practice** check-in page → that team's chat.

- A "coach" has the Coach role or is a Head or Assistant Coach on a team. Members follow current roles and team staff, so changes apply at once. **Directors can open every chat.** Team Parents and Managers are only in their team chats.
- Messages (up to 2,000 characters) show oldest to newest with sender and time; the open chat checks for new messages every 5 seconds. Opening a chat marks it read (not while viewing as someone; posting is refused then too). Enter sends on a keyboard; phones use Send.
- **Unread for 8 hours → one email** per person listing each chat with unread messages (last few shown), each message emailed once, at most one chat email every 8 hours. Checked every 15 minutes with the announcement emails.
- Phone notifications come later (needs hosting).

## 12. Events & check-in (built)
- **Events** tab (Director): list of events, today and later first, past ones collapsed. Each shows date/time, location, player count, ✓/✗/? counts and who runs check-in.
- **+ New event** (Director), quick setup: **Type** (Open Gym, Group Training, Open Run, Tryouts; **+ New type** saves another; **Edit types** removes one from the list, events keep their names), **Gender** (Boys, Girls, Coed = both), **Grades** (checkboxes K–12). The **name is built from the picks**, e.g. "Tryouts – Girls Grades 4–5" (grades shown as ranges). Then date, start time (Eastern), location (gym suggestions or free text), notes, and **who runs check-in** (any active app users). A live count shows how many registered players match.
- The player list is copied from registrations when the event is created. **Update player list** (Director) adds players who registered since; it never removes anyone or changes a check-in. **Delete event** (warning, can't be undone).
- **Check-in screen** (Director and the event's check-in people only; everyone else gets "not found"): players grouped by grade and gender, sorted by last name. Everyone starts at **?**; each tap goes **? → ✓ → ✗ → ?**. Counters for ✓ / ✗ / ? (tap to show only those) and a name search. Each change saves at once and records who made it and when ("Here · Hank Johnson, 9:41 AM"); going back to ? clears that. Other people's taps appear within 15 seconds.
- **Team practices are events too.** Every booked practice from the last 60 days on shows in Events as "Practice – <team>" (green edge; events have a blue edge), with gym and court. A **Show practices** checkbox (on by default) hides or shows them. The Director sees every team's practices; team staff see their own teams' practices (and events they run check-in for).
- **Practice attendance**: the Director and the team's staff (any role) check in the team's **roster** with the same ? → ✓ → ✗ screen. No roster yet → it says so. Each upcoming practice on the team page links to its attendance. Who marked each player is recorded.
- The green **✓ Check-in** button in the header shows for people who run check-in for an event from yesterday on, or whose team practices today.

