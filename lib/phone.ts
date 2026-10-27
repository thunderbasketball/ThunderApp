// Turn whatever the user typed into a 10-digit cell number, or null if it isn't one.
// Accepts "(423) 555-1234", "423.555.1234", "+1 423 555 1234", etc.
export function normalizeCell(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? digits : null;
}

// CoachID = last 7 digits of the cell number.
export function coachIdFromCell(cell: string): string {
  return cell.slice(-7);
}

// For display: 4235551234 -> (423) 555-1234
export function formatCell(cell: string): string {
  return `(${cell.slice(0, 3)}) ${cell.slice(3, 6)}-${cell.slice(6)}`;
}
