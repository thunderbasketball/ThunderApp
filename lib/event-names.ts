// Event names are built from the quick-setup picks, e.g. "Tryouts – Girls 4th–5th Grade". Shared by the server and the form.
import { gradeLabel, ordinal } from "./grades";
import { GRADES } from "./team-names";

export const GENDER_CHOICES = ["Boys", "Girls", "Coed"] as const;
export type GenderChoice = (typeof GENDER_CHOICES)[number];

export const gendersOf = (g: GenderChoice): string[] => (g === "Coed" ? ["Boys", "Girls"] : [g]);
export const genderChoiceOf = (genders: string[]): GenderChoice | null =>
  genders.length === 2 ? "Coed" : genders[0] === "Boys" || genders[0] === "Girls" ? genders[0] : null;

// "4th Grade", "K–3rd Grade", "2nd, 4th–6th Grade"; Kindergarten alone is "Kindergarten".
export function gradesText(grades: readonly string[]): string {
  const idx = GRADES.map((g, i) => (grades.includes(g) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return "";
  if (idx.length === 1) return gradeLabel(GRADES[idx[0]]);
  const runs: string[] = [];
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    runs.push(j - i >= 1 ? `${ordinal(GRADES[idx[i]])}–${ordinal(GRADES[idx[j]])}` : ordinal(GRADES[idx[i]]));
    i = j + 1;
  }
  return `${runs.join(", ")} Grade`;
}

export const eventName = (kind: string, gender: GenderChoice, grades: readonly string[]) => `${kind} – ${gender} ${gradesText(grades)}`;
