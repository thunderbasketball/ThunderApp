// Team naming rules, shared by the server and the New team form.
export const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
export const LEVELS = ["REC", "COMP"] as const;
export const gradeSort = (g: string) => (g === "K" ? 0 : Number(g));

// "4G Epps", "KB Harper"; a multi-grade team takes its top grade.
export function teamName(gender: "Boys" | "Girls", grades: string[], headLastName: string): string {
  const top = [...grades].sort((a, b) => gradeSort(b) - gradeSort(a))[0];
  return `${top}${gender[0]} ${headLastName.trim()}`;
}
