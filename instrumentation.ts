// Runs once when the server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startRegistrationSync } = await import("./lib/teamsnap/scheduler");
    startRegistrationSync();
  }
}
