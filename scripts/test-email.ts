// Sends one test email with the app's email settings.
//   npm run email:test -- you@example.com
import { sendEmail } from "../lib/email";

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.log("Usage: npm run email:test -- you@example.com");
  process.exit(1);
}
try {
  await sendEmail(to, "Thunder Basketball test email", "If you can read this, the app can send email.");
  console.log(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD ? `Sent through Gmail to ${to}.` : "Email isn't set up yet (see above).");
} catch (e) {
  console.log("Couldn't send:", e instanceof Error ? e.message : e);
  process.exit(1);
}
