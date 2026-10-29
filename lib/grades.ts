// How grades read everywhere in the app: "4th Grade", "Kindergarten", "3rd–5th Grade".
export const ordinal = (g: string) => (g === "K" ? "K" : `${g}${["", "st", "nd", "rd"][Number(g)] ?? "th"}`);
export const gradeLabel = (g: string) => (g === "K" ? "Kindergarten" : `${ordinal(g)} Grade`);
