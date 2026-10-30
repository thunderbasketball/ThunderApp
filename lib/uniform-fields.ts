// Uniform choices and checks shared by the server rules and the Uniforms screen (no database code here).
export const SIZES = ["YS", "YM", "YL", "YXL", "AS", "AM", "AL", "AXL", "A2XL"] as const;

export type UniformRow = {
  registrantId: string;
  firstName: string;
  lastName: string;
  grade: string;
  ordered: boolean; // the family ordered a uniform at registration
  askedSize: string | null; // what the parent asked for at registration
  askedNumber: string | null;
  number: string | null;
  size: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
};

// A player is missing something until they have a number, and a size if they ordered a uniform.
export const isMissing = (r: Pick<UniformRow, "ordered" | "number" | "size">) => !r.number || (r.ordered && !r.size);

// Numbers used by more than one player on the team.
export const duplicateNumbers = (rows: Pick<UniformRow, "number">[]) => {
  const seen = new Map<string, number>();
  for (const r of rows) if (r.number) seen.set(r.number, (seen.get(r.number) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n > 1).map(([num]) => num));
};
