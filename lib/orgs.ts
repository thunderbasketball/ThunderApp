// CourtCaptain organizations and how each one looks in the header (SPEC.md section 13).
export type OrgSlug = "thunder" | "scenic-city";

export const ORGS: Record<OrgSlug, { name: string; logo: { src: string; width: number; height: number } }> = {
  thunder: { name: "Thunder Basketball", logo: { src: "/brand/logo-96.png", width: 96, height: 96 } },
  "scenic-city": { name: "Scenic City Basketball", logo: { src: "/brand/scenic-city-192.png", width: 192, height: 192 } },
};

// Scenic City roles that give access (a Request alone doesn't), highest first.
export const SCENIC_ROLES = ["Director", "Partner", "Solo", "Coach"] as const;
export type ScenicRole = (typeof SCENIC_ROLES)[number];
