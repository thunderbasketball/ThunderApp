import "server-only";

// Sends through Resend when RESEND_API_KEY and EMAIL_FROM are set.
// Otherwise (local testing) prints the email in the terminal running `npm run dev`.
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV === "production") throw new Error("Email isn't set up (RESEND_API_KEY / EMAIL_FROM).");
    console.log(`\n📧 EMAIL (not sent — Resend not set up)\n   To: ${to}\n   ${subject}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
