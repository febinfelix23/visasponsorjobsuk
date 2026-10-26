/** Application tracker statuses. Its own module so browser code can use it without the database layer. */
export const STATUSES = [
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Not successful" },
] as const;
export type ApplicationStatus = (typeof STATUSES)[number]["value"];
export const isStatus = (v: unknown): v is ApplicationStatus => STATUSES.some((s) => s.value === v);
