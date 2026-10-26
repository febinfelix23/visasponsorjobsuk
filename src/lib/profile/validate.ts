import { isSubjectCode } from "./subjects";

/**
 * The account page's forms, checked on the server. Every value is re-validated here: the
 * browser only ever proposes, and anything unknown is dropped rather than stored.
 */

export const DEGREE_LEVELS = [
  { value: "bachelors", label: "Bachelor's degree" },
  { value: "masters", label: "Master's degree" },
  { value: "mba", label: "MBA" },
  { value: "phd", label: "PhD or doctorate" },
  { value: "medicine", label: "Medicine (MBBS, MBChB or similar)" },
  { value: "other", label: "Other" },
] as const;
export type DegreeLevel = (typeof DEGREE_LEVELS)[number]["value"];

export const EXPERIENCE_KINDS = [
  { value: "job", label: "Job" },
  { value: "internship", label: "Internship" },
  { value: "placement", label: "Placement year" },
  { value: "volunteering", label: "Volunteering" },
] as const;
export type ExperienceKind = (typeof EXPERIENCE_KINDS)[number]["value"];

export const VISA_TYPES = [
  { value: "student", label: "Student visa" },
  { value: "graduate", label: "Graduate visa" },
  { value: "other", label: "Something else" },
] as const;
export type VisaType = (typeof VISA_TYPES)[number]["value"];

/** Enough for any real history; stops a script filling the database. */
export const MAX_EDUCATION = 5;
export const MAX_EXPERIENCE = 10;

export type EducationInput = { level: DegreeLevel; subjects: string[]; university: string | null; graduationYear: number };
export type ExperienceInput = { title: string; employer: string | null; kind: ExperienceKind; startedOn: string | null; endedOn: string | null };
export type PreferencesInput = { visaType: VisaType | null; visaExpiry: string | null; locations: string[]; remoteOk: boolean };

export type Errors = Record<string, string>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: Errors };

type FormLike = { get(name: string): FormDataEntryValue | null };

const text = (form: FormLike, name: string, max = 120) => {
  const v = form.get(name);
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
};

/** "2024-09" (a month input) → "2024-09-01"; anything else → null. */
const month = (v: string) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? `${v}-01` : null);
const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const done = <T>(errors: Errors, value: T): Parsed<T> => (Object.keys(errors).length ? { ok: false, errors } : { ok: true, value });

/** The ID of the entry being edited, or null when adding. */
export function entryId(form: FormLike): number | null {
  const id = Number(text(form, "id"));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function parseEducation(form: FormLike, now = new Date()): Parsed<EducationInput> {
  const errors: Errors = {};
  const year = now.getUTCFullYear();

  const level = text(form, "level") as DegreeLevel;
  if (!DEGREE_LEVELS.some((d) => d.value === level)) errors.level = "Choose the level of the degree.";

  const first = text(form, "subject");
  if (!isSubjectCode(first)) errors.subject = "Choose the subject from the list.";
  const subjects = [first, text(form, "subject2")].filter((s, i, all) => isSubjectCode(s) && all.indexOf(s) === i);

  const graduationYear = Number(text(form, "graduationYear"));
  if (!Number.isInteger(graduationYear) || graduationYear < year - 40 || graduationYear > year + 6) {
    errors.graduationYear = "Choose the year it was or will be completed.";
  }

  return done(errors, { level, subjects, university: text(form, "university") || null, graduationYear });
}

export function parseExperience(form: FormLike): Parsed<ExperienceInput> {
  const errors: Errors = {};
  const title = text(form, "title");
  if (!title) errors.title = "Add the job title.";

  const kindRaw = text(form, "kind");
  const kind = (EXPERIENCE_KINDS.some((k) => k.value === kindRaw) ? kindRaw : "job") as ExperienceKind;

  const startRaw = text(form, "start");
  const startedOn = startRaw ? month(startRaw) : null;
  if (startRaw && !startedOn) errors.start = "Enter the start as a month and year.";

  const current = form.get("current") === "on";
  const endRaw = current ? "" : text(form, "end");
  const endedOn = endRaw ? month(endRaw) : null;
  if (endRaw && !endedOn) errors.end = "Enter the end as a month and year.";
  if (startedOn && endedOn && endedOn < startedOn) errors.end = "The end is before the start.";
  // An open end means "current", so it has to be said, not left blank by accident.
  if (startedOn && !current && !endRaw) errors.end = "Add the end month, or tick \u201cI work here now\u201d.";

  return done(errors, { title, employer: text(form, "employer") || null, kind, startedOn, endedOn });
}

export function parsePreferences(form: FormLike): Parsed<PreferencesInput> {
  const errors: Errors = {};
  const visa = text(form, "visaType");
  const visaType = VISA_TYPES.some((v) => v.value === visa) ? (visa as VisaType) : null;
  const expiryRaw = text(form, "visaExpiry");
  const visaExpiry = expiryRaw ? day(expiryRaw) : null;
  if (expiryRaw && !visaExpiry) errors.visaExpiry = "Enter the expiry as a full date.";
  const locations = [...new Set(text(form, "locations", 200).split(",").map((l) => l.trim()).filter(Boolean))].slice(0, 5);
  return done(errors, { visaType, visaExpiry: visaType ? visaExpiry : null, locations, remoteOk: form.get("remoteOk") === "on" });
}
