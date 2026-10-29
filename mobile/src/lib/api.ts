// Talks to the Thunder server's /api/mobile endpoints. The server checks the session and role on every call;
// nothing the app holds (name, roles) is trusted there.

// Set in mobile/.env.local, e.g. EXPO_PUBLIC_API_URL=http://192.168.1.16:3000 while testing against `npm run dev`.
const BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

// Mirrors lib/auth/service.ts Step on the server.
export type Step =
  | { step: 'create' }
  | { step: 'pin' }
  | { step: 'starterEmail' }
  | { step: 'starterCode'; maskedEmail: string }
  | { step: 'verifyChoice'; maskedEmail: string | null }
  | { step: 'verifyCode'; maskedEmail: string }
  | { step: 'signupCode'; maskedEmail: string }
  | { step: 'resetCode'; maskedEmail: string }
  | { step: 'devCode' }
  | { step: 'done'; message: string }
  | { step: 'loggedIn'; token: string; expiresAt: string }
  | { step: 'error'; message: string };

// Mirrors SessionUser on the server.
export type User = {
  coachId: string;
  firstName: string;
  lastName: string;
  isDirector: boolean;
  isCoach: boolean;
  requestPending: boolean;
  hasThunderRole: boolean;
  actingBy?: { coachId: string; name: string };
};

const offline: Step = { step: 'error', message: "Can't reach Thunder. Check your connection and try again." };

export async function loginStep(action: string, fields: Record<string, string | null>): Promise<Step> {
  try {
    const r = await fetch(`${BASE}/api/mobile/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...fields }),
    });
    return (await r.json()) as Step;
  } catch {
    return offline;
  }
}

// The logged-in person; null when the token is no good any more (expired, logged out, deactivated).
// Throws when the server can't be reached, so a phone with no signal isn't logged out.
export async function fetchMe(token: string): Promise<User | null> {
  const r = await fetch(`${BASE}/api/mobile/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401) return null;
  if (!r.ok) throw new Error(`Server error ${r.status}`);
  return ((await r.json()) as { user: User }).user;
}

export async function logoutOnServer(token: string): Promise<void> {
  await fetch(`${BASE}/api/mobile/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}
