import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const STARTER_PIN = "1234";

// Stored as "scrypt$<salt hex>$<hash hex>".
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pin, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [kind, saltHex, hashHex] = stored.split("$");
  if (kind !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// No PIN on file counts as the starter PIN.
export async function isStarterPin(stored: string | null): Promise<boolean> {
  return stored === null || (await verifyPin(STARTER_PIN, stored));
}

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Codes are hashed together with their row's cell and purpose.
export function hashCode(cell: string, purpose: string, code: string): string {
  return sha256(`${cell}:${purpose}:${code}`);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}
