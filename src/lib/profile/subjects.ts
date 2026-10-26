import data from "./cah-subjects.json";

/**
 * Degree subjects: HESA's Common Aggregation Hierarchy (CAH), level 3, the grouping UK
 * universities report subjects in, so every UK degree has a home. Codes are stored on
 * profiles and mapped to occupations for the matches page (step D).
 */

export type Subject = { code: string; name: string; group: string };

export const SUBJECTS: Subject[] = data.subjects;

const BY_CODE = new Map(SUBJECTS.map((s) => [s.code, s]));

export const isSubjectCode = (v: unknown): v is string => typeof v === "string" && BY_CODE.has(v);
export const subjectName = (code: string) => BY_CODE.get(code)?.name ?? code;

/** Subjects under their broad area, in code order, for grouped pickers. */
export const SUBJECT_GROUPS: { group: string; subjects: Subject[] }[] = [...new Set(SUBJECTS.map((s) => s.group))].map((group) => ({
  group,
  subjects: SUBJECTS.filter((s) => s.group === group),
}));
