import { deps } from "@/lib/auth/server";
import { mobileLoginStep } from "@/lib/auth/mobile";

// Phone app login: one step per call ({ action, ...fields }), same rules as the website's login screens.
// On "loggedIn" the reply carries the session token; the app keeps it in the phone's secure storage.
export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // Left as null; mobileLoginStep answers with an error.
  }
  try {
    return Response.json(await mobileLoginStep(deps, body));
  } catch (e) {
    console.error("Phone login step failed:", e);
    return Response.json({ step: "error", message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
