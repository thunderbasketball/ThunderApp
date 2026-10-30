// A PIN someone just set is held encrypted until it's written to the MasterAuth sheet (Scenic City still reads plain
// PINs there), then deleted. The key is MASTERAUTH_PIN_KEY in .env.local (32 random bytes, base64). Without a key,
// or with the sync off, PINs aren't kept at all.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Queryable } from "../sql";

function key(): Buffer | null {
  const k = process.env.MASTERAUTH_PIN_KEY ? Buffer.from(process.env.MASTERAUTH_PIN_KEY, "base64") : null;
  return k && k.length === 32 ? k : null;
}

export const syncOn = () => process.env.MASTERAUTH_SYNC === "on" && !!process.env.MASTERAUTH_SHEET;

// "v1.<iv>.<tag>.<ciphertext>", all base64url. Null when there's no key.
export function sealPin(pin: string, k = key()): string | null {
  if (!k || !/^\d{4}$/.test(pin)) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(pin, "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), body].map((x) => (typeof x === "string" ? x : x.toString("base64url"))).join(".");
}

// Null when it can't be opened (wrong or missing key, tampered).
export function openPin(sealed: string, k = key()): string | null {
  const [v, iv, tag, body] = sealed.split(".");
  if (!k || v !== "v1" || !iv || !tag || !body) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    const pin = Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
    return /^\d{4}$/.test(pin) ? pin : null;
  } catch {
    return null;
  }
}

// Call right after saving a new PIN hash, in the same transaction (the users trigger has just queued them).
export async function queuePin(q: Queryable, coachId: string, sealed: string | null) {
  if (!sealed || !syncOn()) return;
  await q.query(
    `insert into masterauth_outbox (coach_id, pin_enc, queued_at) values ($1, $2, clock_timestamp())
     on conflict (coach_id) do update set pin_enc = excluded.pin_enc, starter_pin = false, queued_at = excluded.queued_at,
       attempts = 0, next_try_at = null, last_error = null`,
    [coachId, sealed],
  );
}
