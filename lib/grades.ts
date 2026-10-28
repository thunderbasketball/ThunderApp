export const gradeLabel = (g: string) => (g === "K" ? "Kindergarten" : `${g}${["", "st", "nd", "rd"][Number(g)] ?? "th"} grade`);
