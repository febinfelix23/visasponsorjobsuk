export type Seniority = "graduate" | "entry" | "junior" | "mid" | "senior" | "unknown";

export type SeniorityResult = { seniority: Seniority; isGradScheme: boolean; isInternship: boolean; isApprenticeship?: boolean };

const t = (title: string) => ` ${title.toLowerCase().replace(/[^a-z0-9+ ]+/g, " ").replace(/\s+/g, " ")} `;

const INTERNSHIP = /\b(intern|internship|summer analyst|summer associate|placement|work experience|insight (week|programme|day)|spring week)\b/;
const APPRENTICESHIP = /\b(apprentice|apprenticeship)\b/;
const GRAD_SCHEME = /\b(graduate (scheme|programme|program|trainee|development programme)|grad scheme|graduate|new grad|early careers?|campus hire|foundation (year|doctor|programme)|fy ?[12])\b/;
// "staff" only means senior in tech titles ("Staff Engineer"), never in "Staff Nurse".
const SENIOR = /\b(senior|sr|lead|principal|staff (engineer|software|developer|data|scientist|product|designer|ml|machine)|head of|director|vp|vice president|chief|cto|cfo|ceo|partner|consultant (in|physician|surgeon)|associate director|matron)\b/;
const MID = /\b(manager|architect|registrar|specialty doctor|speciality doctor|specialist)\b/;
const JUNIOR = /\b(junior|jr|entry level|trainee|apprentice|associate|assistant|engineer i|analyst i|developer i|level 1)\b/;

/** NHS Agenda for Change: Band 5 is newly qualified, 6 early career, 7+ senior. */
function nhsBand(salaryText: string | null | undefined): number | null {
  const m = /\bband ([2-9])\b/i.exec(salaryText ?? "");
  return m ? Number(m[1]) : null;
}

/** "3+ years of experience" → 3. The largest such figure in the text. */
export function yearsRequired(text: string | null | undefined): number | null {
  if (!text) return null;
  let best: number | null = null;
  for (const m of text.matchAll(/\b(\d{1,2})\s?\+?\s?(?:-\s?\d{1,2}\s?)?years?(?:'|’)?\s+(?:of\s+)?(?:\w+\s+){0,3}?experience/gi)) {
    const n = Number(m[1]);
    if (n <= 20 && (best === null || n > best)) best = n;
  }
  return best;
}

export function classifySeniority(title: string, description?: string | null, salaryText?: string | null): SeniorityResult {
  const text = t(title);
  const isInternship = INTERNSHIP.test(text);
  const isGradScheme = !isInternship && GRAD_SCHEME.test(text);
  if (isInternship) return { seniority: "entry", isGradScheme: false, isInternship };
  if (APPRENTICESHIP.test(text)) return { seniority: "entry", isGradScheme: false, isInternship: false, isApprenticeship: true };
  if (isGradScheme) return { seniority: "graduate", isGradScheme, isInternship };
  if (SENIOR.test(text)) return { seniority: "senior", isGradScheme, isInternship };
  if (MID.test(text)) return { seniority: "mid", isGradScheme, isInternship };
  if (JUNIOR.test(text)) return { seniority: /\b(trainee|apprentice|entry level)\b/.test(text) ? "entry" : "junior", isGradScheme, isInternship };

  const band = nhsBand(salaryText);
  if (band !== null) {
    return { seniority: band <= 5 ? "entry" : band === 6 ? "junior" : "senior", isGradScheme, isInternship };
  }
  const years = yearsRequired(description);
  if (years !== null) {
    return { seniority: years <= 1 ? "entry" : years <= 2 ? "junior" : years <= 4 ? "mid" : "senior", isGradScheme, isInternship };
  }
  return { seniority: "unknown", isGradScheme, isInternship };
}
