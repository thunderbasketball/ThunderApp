// The choices on an evaluation card. Shared by the server rules and the phone screen.
export const POSITIONS = ["Guard", "Wing", "Post"] as const;
export const HEIGHTS = ["Short", "Average", "Tall"] as const;
export const SPEEDS = ["Slow", "Average", "Fast"] as const;
export const NOTES_MAX = 1000;

export type Fields = {
  position: (typeof POSITIONS)[number] | null;
  height: (typeof HEIGHTS)[number] | null;
  speed: (typeof SPEEDS)[number] | null;
  score: number | null;
  notes: string;
  interested: boolean;
};
