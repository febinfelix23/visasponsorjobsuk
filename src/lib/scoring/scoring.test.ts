import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getOccupation } from "./occupations";
import { annualise, parseSalary, salaryFromDescription } from "./salary";
import { scoreJob, type ScoreInput } from "./score";
import { classifySeniority, yearsRequired } from "./seniority";
import { sponsorshipSignal } from "./signals";
import { classifyOccupation, CLASSIFIER_CODES } from "./soc";
import { FIELD_KEYS, FIELD_RULE_CODES, FIELDS, fieldFromOccupation, isFieldKey } from "./fields";
import { classificationKey, legacyClassificationKey, parseClassifications } from "./ai-classify";
import type { Reading } from "../reading/schema";
import { capDescription, MAX_DESCRIPTION_CHARS } from "../scrape/text";
import { rowsFor } from "@/components/site/sponsorship-check";

describe("occupation table", () => {
  it("has the official new-entrant rates", () => {
    assert.deepEqual([getOccupation("2134")?.eligibility, getOccupation("2134")?.newEntrantRate], ["eligible", 38300]);
    assert.equal(getOccupation("2237")?.eligibility, "national_pay_scale");
    assert.equal(getOccupation("6131")?.eligibility, "limited"); // override: healthcare assistants
    assert.equal(getOccupation("9999"), null);
  });

  it("contains every code the title classifier can return", () => {
    for (const soc of CLASSIFIER_CODES) assert.ok(getOccupation(soc), `SOC ${soc} missing from the rules table`);
  });
});

describe("fields", () => {
  it("files work by what it is, not who the employer is", () => {
    assert.equal(fieldFromOccupation("2134", "Backend Engineer III"), "software");
    assert.equal(fieldFromOccupation("2422", "Financial Analyst"), "finance");
    assert.equal(fieldFromOccupation("2237", "Staff Nurse"), "healthcare");
    assert.equal(fieldFromOccupation("3544", "Data Analyst"), "data");
    assert.equal(fieldFromOccupation("3556", "Account Manager"), "sales_marketing");
    assert.equal(fieldFromOccupation("2431", "Sales Consultant"), "business");
  });

  it("never guesses a field from the employer when the occupation is unknown", () => {
    assert.equal(fieldFromOccupation(null, "Data Science Manager"), null);
  });

  it("splits SOC 2433 between finance and data by title", () => {
    assert.equal(fieldFromOccupation("2433", "Actuarial Analyst"), "finance");
    assert.equal(fieldFromOccupation("2433", "Data Scientist"), "data");
  });

  it("has unique keys, and every rule code is in the official table", () => {
    assert.equal(new Set(FIELD_KEYS).size, FIELDS.length);
    assert.ok(isFieldKey("software") && !isFieldKey("tech"));
    for (const soc of FIELD_RULE_CODES) assert.ok(getOccupation(soc), `SOC ${soc} missing from the rules table`);
  });
});

describe("AI classification", () => {
  it("shares one cached result across title variants, only within an employer", () => {
    assert.equal(classificationKey("Software Engineer Graduate Scheme (Manchester)", "Lloyds Bank plc"), classificationKey("software engineer graduate scheme  (Leeds)", "LLOYDS BANK PLC"));
    assert.notEqual(classificationKey("Associate", "Deloitte LLP"), classificationKey("Associate", "Lloyds Bank plc"));
    // Older rows stay readable until re-classified, and never collide with new keys.
    assert.equal(legacyClassificationKey("Consultant (Leeds)", "healthcare"), "consultant|healthcare");
    assert.notEqual(classificationKey("Consultant", "healthcare"), legacyClassificationKey("Consultant", "healthcare"));
  });

  it("keeps only known fields and codes that exist in the official table", () => {
    const parsed = parseClassifications(
      JSON.stringify({
        results: [
          { id: 0, field: "data", soc: "2433" },
          { id: 1, field: "sales_marketing", soc: "9999" }, // invented code: dropped, field kept
          { id: 2, field: "astrology", soc: "2134" }, // unknown field: dropped, code kept
          { id: 7, field: "software", soc: "2134" }, // id out of range: ignored
        ],
      }),
      3,
    );
    assert.deepEqual(parsed.get(0), { socCode: "2433", field: "data" });
    assert.deepEqual(parsed.get(1), { socCode: null, field: "sales_marketing" });
    assert.deepEqual(parsed.get(2), { socCode: "2134", field: null });
    assert.equal(parsed.has(7), false);
    assert.equal(parseClassifications("not json", 3).size, 0);
  });

  it("never rules a job out on an AI-chosen ineligible code alone", () => {
    const csm = scoreJob({ ...base, title: "Customer Success Manager", aiSocCode: "7219", aiField: "sales_marketing", salaryText: "£50,000" });
    assert.equal(csm.sponsorability, "check_with_employer");
    assert.ok(csm.reasons.some((r) => r.code === "occupation_maybe_ineligible"));
    // The keyword rules' own ineligible codes still rule a job out.
    assert.equal(scoreJob({ ...base, title: "Mobile Patrol Officer", sector: "engineering" }).sponsorability, "ineligible");
  });

  it("prefers the AI's occupation and field over the keyword rules", () => {
    const r = scoreJob({ ...base, title: "Data Science Manager", sector: "finance", aiSocCode: "2433", aiField: "data", salaryText: "£80,000" });
    assert.deepEqual([r.socCode, r.field, r.sponsorability], ["2433", "data", "likely_eligible"]);
    // Where the rules and the AI disagree, the AI wins: the rules read "Security Officer" as guarding.
    const infosec = scoreJob({ ...base, title: "Security Officer", aiSocCode: "2135", aiField: "software" });
    assert.deepEqual([infosec.socCode, infosec.field], ["2135", "software"]);
    const bogus = scoreJob({ ...base, title: "Data Science Manager", aiSocCode: "9999", aiField: null });
    assert.equal(bogus.socCode, null);
  });
});

describe("classifyOccupation", () => {
  const cases: [string, string | null, string | null][] = [
    ["Graduate Software Engineer", "tech", "2134"],
    ["Senior Frontend Developer (React)", "tech", "2134"],
    ["DevOps Engineer", "tech", "2139"],
    ["Data Engineer", "finance", "2133"],
    ["Data Scientist", "tech", "2433"],
    ["QA Automation Engineer", "tech", "2136"],
    ["Cyber Security Analyst", "tech", "2135"],
    ["Product Manager", "tech", "2132"],
    ["UX Designer", "tech", "2141"],
    ["Audit Associate - 2027 Graduate Scheme", "finance", "2421"],
    ["Tax Trainee", "finance", "2423"],
    ["Graduate Structural Engineer", "engineering", "2121"],
    ["Mechanical Design Engineer", "engineering", "2122"],
    ["Avionics Systems Engineer", "engineering", "2126"],
    ["Staff Nurse - Band 5", "healthcare", "2237"],
    ["Mental Health Nurse", "healthcare", "2235"],
    ["Clinical Fellow in Emergency Medicine", "healthcare", "2211"],
    ["Physiotherapist", "healthcare", "2221"],
    ["Healthcare Assistant", "healthcare", "6131"],
    ["Systems Engineer", "engineering", "2129"],
    ["Warehouse Supervisor", "tech", null],
    ["Enterprise Account Executive", "tech", "3552"],
    ["Customer Success Manager", "tech", "3556"],
    ["Senior Project Manager", "engineering", "2440"],
    ["Technical Project Manager", "tech", "2131"],
    ["Quantity Surveyor", "engineering", "2453"],
    ["Senior Legal Counsel", "tech", "2412"],
    ["Data Analyst", "finance", "3544"],
    ["Senior Financial Reporting Analyst", "finance", "2421"],
    ["Regulatory Reporting Analyst", "finance", "2421"],
    ["Junior Information Security Officer", "tech", "2135"],
    ["Security Operations Coordinator", "tech", null],
    ["Mobile Patrol Officer", "engineering", "9231"],
    ["Member of Technical Staff, Modeling", "tech", "2134"],
    ["Senior Analyst, Post Trade Management", "finance", "2422"],
    ["O&M Mechanical Technician", "engineering", "3113"],
  ];
  for (const [title, sector, soc] of cases) {
    it(`${title} → ${soc}`, () => assert.equal(classifyOccupation(title, sector), soc));
  }

  it("doesn't call a hospital 'doctor' rule outside healthcare", () => {
    assert.equal(classifyOccupation("Doctor of Data", "tech"), null);
  });
});

describe("parseSalary", () => {
  it("reads the common UK formats", () => {
    assert.deepEqual(parseSalary("£45,000 - £55,000 per annum"), { min: 45000, max: 55000, period: "year" });
    assert.deepEqual(parseSalary("£42k"), { min: 42000, max: 42000, period: "year" });
    assert.deepEqual(parseSalary("£40k–£50k + bonus"), { min: 40000, max: 50000, period: "year" });
    assert.deepEqual(parseSalary("£22.50 per hour"), { min: 22.5, max: 22.5, period: "hour" });
    assert.deepEqual(parseSalary("Band 5 · £32,073 to £39,043 a year"), { min: 32073, max: 39043, period: "year" });
    assert.deepEqual(parseSalary("£1,500 a day"), { min: 1500, max: 1500, period: "day" });
  });

  it("ignores non-salary money and vague pay", () => {
    assert.equal(parseSalary("Competitive"), null);
    assert.equal(parseSalary("Depending on experience"), null);
    assert.equal(parseSalary("£2bn of assets under management"), null);
  });

  it("doesn't read a later 'per week' or a joining bonus as the salary (MBDA regression)", () => {
    const text = "Salary: £31,900 starting salary plus £3000 joining bonus.\n\nDynamic Working : 5 days per week on-site.";
    assert.deepEqual(salaryFromDescription(text), { min: 31900, max: 31900, period: "year" });
    assert.equal(parseSalary("£3,000 joining bonus"), null);
  });

  it("doesn't read an allowance or a unit-less small figure as pay (Helsing regression)", () => {
    assert.equal(salaryFromDescription("Learning : €500/£450 yearly allowance"), null);
    assert.equal(parseSalary("£450"), null);
    assert.deepEqual(parseSalary("£450 per day"), { min: 450, max: 450, period: "day" });
  });

  it("skips salary-sized bonuses and allowances", () => {
    assert.equal(parseSalary("£15,000 annual bonus"), null);
    assert.deepEqual(salaryFromDescription("Package: £15,000 sign-on bonus plus £45,000 base salary"), { min: 45000, max: 45000, period: "year" });
  });

  it("doesn't treat GP per-session pay as a salary", () => {
    assert.equal(parseSalary("£10,500 per session per annum"), null);
  });

  it("never returns an implausible range end (overflow regression)", () => {
    assert.deepEqual(parseSalary("£40,000 - £4,000,000"), { min: 40000, max: 40000, period: "year" });
    assert.deepEqual(parseSalary("£25 - £2,500,000 per hour"), { min: 25, max: 25, period: "hour" });
  });

  it("annualises hourly and daily pay", () => {
    assert.equal(annualise(22.5, "hour"), 43875);
    assert.equal(annualise(400, "day"), 104000);
  });

  it("reads 'up to £X' as a ceiling, with no starting figure", () => {
    assert.deepEqual(parseSalary("Depending on experience Up to £129,500 per annum"), { min: 129500, max: 129500, period: "year", ceilingOnly: true });
    assert.equal(parseSalary("£45,000 - £55,000")?.ceilingOnly, undefined);
  });

  it("takes every figure in a salary field, skipping commission and OTE", () => {
    assert.deepEqual(parseSalary("London £45,000; National £38,000", { envelope: true }), { min: 38000, max: 45000, period: "year" });
    assert.deepEqual(parseSalary("£119,140 to £125,693 a year Up to £125,693 per annum", { envelope: true }), { min: 119140, max: 125693, period: "year" });
    assert.deepEqual(parseSalary("£100K – £120K • Offers Equity • £100K – £120K Commission", { envelope: true }), { min: 100000, max: 120000, period: "year" });
    assert.deepEqual(parseSalary("Base £40,000, OTE £60,000", { envelope: true }), { min: 40000, max: 40000, period: "year" });
    // Without envelope (descriptions), the first salary still wins.
    assert.deepEqual(parseSalary("London £45,000; National £38,000"), { min: 45000, max: 45000, period: "year" });
  });

  it("only takes a salary from a description where it's introduced as pay", () => {
    assert.deepEqual(salaryFromDescription("End Date Sunday 25 October 2026 Salary Range £42,000 Before you start"), { min: 42000, max: 42000, period: "year" });
    assert.equal(salaryFromDescription("We manage £2bn for clients and offer a £500 learning budget."), null);
  });
});

describe("classifySeniority", () => {
  it("spots graduate schemes, internships and levels", () => {
    assert.deepEqual(classifySeniority("Software Engineer Graduate Scheme (London)"), { seniority: "graduate", isGradScheme: true, isInternship: false });
    assert.equal(classifySeniority("Summer Internship 2027").isInternship, true);
    assert.equal(classifySeniority("Senior Data Engineer").seniority, "senior");
    assert.equal(classifySeniority("Junior Developer").seniority, "junior");
    assert.equal(classifySeniority("Product Manager").seniority, "mid");
    assert.equal(classifySeniority("Consultant Dermatologist").seniority, "senior");
    assert.equal(classifySeniority("Consultant Psychiatrist - EDU").seniority, "senior");
    assert.notEqual(classifySeniority("IT Consultant").seniority, "senior");
    assert.equal(classifySeniority("Staff Nurse", null, "Band 5 · £32,073 to £39,043 a year").seniority, "entry");
    assert.equal(classifySeniority("Backend Engineer", "You have 5+ years of professional experience").seniority, "senior");
  });

  it("reads required experience", () => {
    assert.equal(yearsRequired("2-3 years of commercial experience"), 2);
    assert.equal(yearsRequired("At least 3 years’ relevant experience"), 3);
    assert.equal(yearsRequired("no experience needed"), null);
  });
});

describe("capDescription", () => {
  it("keeps up to 20,000 characters, then the start and the end of a longer ad", () => {
    const long = `${"Duties. ".repeat(1800)}Salary £45,000.`;
    assert.equal(capDescription(long), long); // about 14,400 characters: kept whole
    const ad = `${"Duties. ".repeat(4000)}We are unable to offer visa sponsorship.`;
    const capped = capDescription(ad);
    assert.ok(capped.length <= MAX_DESCRIPTION_CHARS + 10);
    assert.equal(MAX_DESCRIPTION_CHARS, 20_000);
    assert.ok(capped.startsWith("Duties."));
    assert.ok(capped.endsWith("We are unable to offer visa sponsorship."));
    assert.equal(capDescription("Short ad."), "Short ad.");
  });
});

describe("sponsorshipSignal", () => {
  it("finds explicit yes and no statements, with no winning", () => {
    const nhs = sponsorshipSignal("Applications from job seekers who require current Skilled worker sponsorship to work in the UK are welcome and will be considered alongside all other applications.");
    assert.ok(nhs.nhsStatement);
    assert.equal(nhs.positive, null);
    assert.equal(nhs.hedged, null);
    assert.ok(sponsorshipSignal("Visa sponsorship is available for this role.").positive);
    assert.ok(sponsorshipSignal("Please note visa sponsorship for this role is unfortunately not available.").negative);
    assert.ok(sponsorshipSignal("We are unable to offer visa sponsorship.").negative);
    assert.ok(sponsorshipSignal("You must be able to work in the UK without sponsorship").negative);
    const both = sponsorshipSignal("We offer great benefits. We cannot offer sponsorship for this role.");
    assert.ok(both.negative);
  });

  it("quotes the sentence that mentions sponsorship, not the text around it", () => {
    const s = sponsorshipSignal("4 weeks Work From Anywhere per year. We are able to offer visa sponsorship for this position. OUR PROCESS - three interviews");
    assert.equal(s.positive, "We are able to offer visa sponsorship for this position.");
  });

  it("reads typographic apostrophes and 'will not be able to' as a no (live false positives)", () => {
    const monzo = sponsorshipSignal("We can’t offer visa sponsorship, but we review sponsorship role by role, so keep an eye on our careers site for future opportunities.");
    assert.ok(monzo.negative);
    assert.equal(monzo.positive, null);
    assert.ok(sponsorshipSignal("Airbus will not be able to offer sponsorship for any employment Visas.").negative);
    assert.ok(sponsorshipSignal("We are not able offer visa sponsorship.").negative);
    assert.ok(sponsorshipSignal("Right to Work – You’ll need a valid work visa; we’re not able to offer sponsorship at the moment").negative);
  });

  it("doesn't read export-control or conditional wording as a no for this job (live false negatives)", () => {
    assert.equal(sponsorshipSignal("Applicants must be able to access export-controlled data under US export laws without sponsorship for an export license.").negative, null);
    const leeds = sponsorshipSignal("Leeds Teaching Hospital NHS Trust is unable to provide sponsorship to applicants who do not meet the eligibility criteria.");
    assert.deepEqual([leeds.negative, !!leeds.conditional], [null, true]);
    const notAll = sponsorshipSignal("Although we are a registered sponsor organisation, we are unable to offer sponsorship for all job roles.");
    assert.deepEqual([notAll.negative, !!notAll.conditional, notAll.positive], [null, true, null]);
    assert.equal(sponsorshipSignal("Please note we can not sponsor GMC for this role.").negative, null);
    assert.equal(sponsorshipSignal("The Trust will not sponsor where the starting salary does not meet immigration rules.").negative, null);
    // A plain "no" for a whole group of roles is still a no.
    assert.ok(sponsorshipSignal("We are unable to sponsor work visas for our Early Careers opportunities.").negative);
  });

  it("treats a maybe as a maybe, and ignores screening questions", () => {
    const maybe = sponsorshipSignal("Sponsorship may be considered for exceptional candidates.");
    assert.deepEqual([maybe.positive, !!maybe.hedged], [null, true]);
    assert.ok(sponsorshipSignal("We are also willing to sponsor UK Visa for the right candidate if required.").positive);
    const question = sponsorshipSignal("Will you now or in the future require visa sponsorship? Do you require sponsorship to work in the UK without sponsorship?");
    assert.deepEqual([question.negative, question.positive], [null, null]);
  });

  it("treats the right-to-work line as soft", () => {
    const s = sponsorshipSignal("You must have the right to work in the UK.");
    assert.deepEqual([s.negative, s.rightToWorkOnly], [null, true]);
  });
});

const base: ScoreInput = {
  title: "Software Engineer Graduate Scheme",
  description: "Join our team.",
  salaryText: null,
  salaryMin: null,
  salaryMax: null,
  salaryPeriod: null,
  employmentType: null,
  sector: "tech",
  isNhsJobs: false,
  licensedSponsor: true,
  sponsorName: "Lloyds Bank plc",
};
const codes = (r: ReturnType<typeof scoreJob>) => r.reasons.map((x) => x.code);

describe("scoreJob", () => {
  it("is likely eligible: licensed sponsor, eligible occupation, pay at the new-entrant rate", () => {
    const r = scoreJob({ ...base, description: "End Date Sunday 25 October 2026 Salary Range £48,500" });
    assert.equal(r.sponsorability, "likely_eligible");
    assert.equal(r.socCode, "2134");
    assert.equal(r.salaryAnnualMin, 48500);
    assert.ok(codes(r).includes("salary_meets_new_entrant"));
  });

  it("is ineligible when pay is below the occupation's new-entrant rate", () => {
    // Software developers need £38,300 as new entrants, not just the £33,400 floor.
    const r = scoreJob({ ...base, salaryText: "£34,000 - £36,000" });
    assert.equal(r.sponsorability, "ineligible");
    assert.ok(codes(r).includes("salary_below_new_entrant"));
  });

  it("puts the ad's own words first", () => {
    assert.equal(scoreJob({ ...base, description: "Salary £60,000. We are unable to offer visa sponsorship." }).sponsorability, "ineligible");
    // An offer from an employer we can't find on the register is never green.
    assert.equal(scoreJob({ ...base, licensedSponsor: false, salaryText: "£50,000", description: "Visa sponsorship is available." }).sponsorability, "unknown");
  });

  it("doesn't let the NHS statement outrank the band, occupation or contract checks", () => {
    const cos = "Certificate of Sponsorship\nApplications from job seekers who require current Skilled worker sponsorship to work in the UK are welcome.";
    const nhs = { ...base, sector: "healthcare", isNhsJobs: true, description: cos, sponsorName: "Leeds Teaching Hospitals NHS Trust" };
    // Band 3 support worker: limited occupation.
    const hca = scoreJob({ ...nhs, title: "Respiratory Health Care Support Worker", aiSocCode: "6131", salaryText: "Band 3 · £25,760 a year" });
    assert.equal(hca.sponsorability, "check_with_employer");
    assert.ok(codes(hca).includes("nhs_sponsorship_statement"));
    // Band 4 in a pay-scale occupation.
    const band4 = scoreJob({ ...nhs, title: "Assistant Practitioner Nurse", aiSocCode: "2237", salaryText: "Band 4 · £28,392 a year" });
    assert.equal(band4.sponsorability, "check_with_employer");
    assert.ok(codes(band4).includes("nhs_band_below_5"));
    // Bank and locum work is never listed as sponsorable, statement or not.
    assert.equal(scoreJob({ ...nhs, title: "Staff Nurse", employmentType: "Bank", salaryText: "Band 5" }).sponsorability, "ineligible");
    assert.equal(scoreJob({ ...nhs, title: "Locum Clinical Fellow", aiSocCode: "2212", employmentType: "Locum", salaryText: "Doctor - other · £67,325 a year" }).sponsorability, "ineligible");
    // A real "no" elsewhere in the ad still wins.
    assert.equal(scoreJob({ ...nhs, title: "Staff Nurse", salaryText: "Band 5", description: `${cos}\nPlease note we are unable to provide Visa sponsorship for this post.` }).sponsorability, "ineligible");
  });

  it("needs a stated salary or an NHS pay band before an offer is green", () => {
    const offer = { ...base, title: "Software Developer", description: "Visa sponsorship is available." };
    assert.equal(scoreJob(offer).sponsorability, "check_with_employer");
    assert.equal(scoreJob({ ...offer, salaryText: "£45,000" }).sponsorability, "sponsorship_mentioned");
  });

  it("doesn't let an employer's offer outrank a limited occupation", () => {
    const r = scoreJob({ ...base, title: "Sales Executive", aiSocCode: "3552", salaryText: "£40,000", description: "Visa sponsorship is available." });
    assert.equal(r.sponsorability, "check_with_employer");
    assert.ok(codes(r).includes("ad_mentions_sponsorship"));
  });

  it("treats NHS posts on the pay scale as likely eligible, and the CoS statement as sponsorship mentioned", () => {
    const nhs = { ...base, title: "Staff Nurse", sector: "healthcare", isNhsJobs: true, salaryText: "Band 5 · £32,073 to £39,043 a year", sponsorName: "Leeds Teaching Hospitals NHS Trust" };
    assert.equal(scoreJob(nhs).sponsorability, "likely_eligible");
    const cos = scoreJob({ ...nhs, description: "Certificate of Sponsorship\nApplications from job seekers who require current Skilled worker sponsorship to work in the UK are welcome." });
    assert.equal(cos.sponsorability, "sponsorship_mentioned");
  });

  it("asks people to check when it can't confirm the salary rule", () => {
    assert.equal(scoreJob(base).sponsorability, "check_with_employer");
    assert.equal(scoreJob({ ...base, title: "Warehouse Supervisor" }).sponsorability, "check_with_employer");
    assert.equal(scoreJob({ ...base, description: "Salary £50,000. You must have the right to work in the UK." }).sponsorability, "check_with_employer");
  });

  it("says unknown when the employer isn't on the register and the ad says nothing", () => {
    assert.equal(scoreJob({ ...base, licensedSponsor: false, salaryText: "£50,000" }).sponsorability, "unknown");
  });

  it("rules out internships, placements, apprenticeships and ineligible occupations", () => {
    assert.equal(scoreJob({ ...base, title: "Summer Internship - Software" }).sponsorability, "ineligible");
    assert.equal(scoreJob({ ...base, title: "Project Management Placement (12.5 months)" }).sponsorability, "ineligible");
    assert.equal(scoreJob({ ...base, title: "Software Engineering Degree Apprenticeship" }).sponsorability, "ineligible");
    assert.equal(scoreJob({ ...base, title: "Mobile Patrol Officer", sector: "engineering" }).sponsorability, "ineligible");
  });

  it("ignores structured salaries of £0 or with an implausible period", () => {
    const zero = scoreJob({ ...base, salaryMin: 0, salaryMax: 0, salaryPeriod: "year" });
    assert.equal(zero.salaryAnnualMin, null);
    const mislabelled = scoreJob({ ...base, salaryMin: 50000, salaryMax: 60000, salaryPeriod: "hour", salaryText: "£50,000 - £60,000" });
    assert.equal(mislabelled.salaryAnnualMin, 50000);
  });

  it("rules out self-employed, bank, locum, sessional and zero-hours work (founder's rule, 2026-10-28)", () => {
    assert.equal(scoreJob({ ...base, title: "Field Sales Consultant (Self-employed)", salaryText: "£60,000" }).sponsorability, "ineligible");
    const gp = { ...base, sector: "healthcare", isNhsJobs: true, salaryText: "Band 6 · NHS" };
    assert.equal(scoreJob({ ...gp, title: "Staff Nurse" }).sponsorability, "likely_eligible");
    for (const title of ["Locum GP", "Bank Nurse - HMP Liverpool", "Sessional Psychologist", "Zero Hours Support Nurse"]) assert.equal(scoreJob({ ...gp, title }).sponsorability, "ineligible", title);
    const bank = scoreJob({ ...gp, title: "Staff Nurse", employmentType: "Bank" });
    assert.equal(bank.sponsorability, "ineligible");
    assert.ok(codes(bank).includes("as_needed_contract"));
  });

  it("rules out contractors and body-only self-employed roles (spot-check regressions)", () => {
    assert.equal(scoreJob({ ...base, title: "Software Developer - Consultant (Contract)", employmentType: "Contract - Contingent Day Rate", salaryText: "£60,000" }).sponsorability, "ineligible");
    assert.equal(scoreJob({ ...base, title: "Payment Consultant", description: "This is a self-employed role. Earn £143,000 OTE." }).sponsorability, "ineligible");
  });

  it("only rules out self-employed roles, not ads that mention self-employed customers (live false positives)", () => {
    const afin = "Afin Bank caters to a diverse clientele, including self-employed professionals, foreign nationals, and high-net-worth individuals.";
    assert.notEqual(scoreJob({ ...base, title: "Senior Product Manager, Savings and Mortgages", description: afin }).sponsorability, "ineligible");
    assert.notEqual(scoreJob({ ...base, description: "We offer mortgages for the self-employed." }).sponsorability, "ineligible");
    const roles = [
      "Field Sales Consultants Wanted | Sell More with Teya\nUncapped Commissions | Self-Employed | Flexible",
      "Contract Type: Freelance / Self-Employed (Commission-Only)",
      "We would ideally like to engage someone on a self-employed basis initially.",
      "We will champion you as a self employed clinician.",
    ];
    for (const d of roles) assert.equal(scoreJob({ ...base, title: "Consultant", description: d }).sponsorability, "ineligible", d);
  });

  it("can't confirm the salary rule from 'up to' pay or for part-time posts", () => {
    const upTo = scoreJob({ ...base, title: "Software Developer", salaryText: "Up to £45,000" });
    assert.equal(upTo.sponsorability, "check_with_employer");
    assert.deepEqual([upTo.salaryAnnualMin, upTo.salaryAnnualMax], [null, 45000]);
    assert.ok(codes(upTo).includes("salary_ceiling_only"));
    // A ceiling below the rate is still clearly below it.
    assert.equal(scoreJob({ ...base, title: "Software Developer", salaryText: "Up to £30,000" }).sponsorability, "ineligible");

    // Part-time posts are never listed as sponsorable (founder's rule, 2026-10-28).
    const partTime = scoreJob({ ...base, title: "Software Developer", employmentType: "Part time", salaryText: "£50,000 pro rata" });
    assert.equal(partTime.sponsorability, "ineligible");
    assert.ok(codes(partTime).includes("part_time"));
    assert.equal(scoreJob({ ...base, title: "Software Developer", employmentType: "Full time, Part time", salaryText: "£50,000" }).sponsorability, "likely_eligible");
    const nhs = { ...base, title: "Dental Nurse", aiSocCode: "2237", sector: "healthcare", isNhsJobs: true };
    assert.equal(scoreJob({ ...nhs, salaryText: "Band 5 · £31,049 a year per annum, pro rata (Actual £12,462.80)" }).sponsorability, "ineligible");
  });

  it("only uses the NHS pay-scale shortcut for NHS posts", () => {
    const pharma = { ...base, title: "Senior Clinical Research Physician", sector: "healthcare", sponsorName: "GSK Plc", description: "Experience of NHS clinical practice preferred." };
    assert.equal(scoreJob(pharma).sponsorability, "check_with_employer");
    assert.equal(scoreJob({ ...pharma, salaryText: "£120,000" }).sponsorability, "likely_eligible");
  });

  it("gives the rules date in words, not as an ISO date", () => {
    const msg = scoreJob(base).reasons.find((r) => r.code === "salary_unknown")?.message ?? "";
    assert.match(msg, /rules as of \d{1,2} [A-Z][a-z]+ \d{4}\)/);
    assert.doesNotMatch(msg, /\d{4}-\d{2}-\d{2}/);
  });

  it("only emits reasons the job page knows how to show", () => {
    const source = readFileSync(new URL("./score.ts", import.meta.url), "utf8");
    const emitted = [...source.matchAll(/code: "([a-z0-9_]+)"/g)].map((m) => m[1]);
    assert.ok(emitted.length > 15, "the code pattern no longer finds the reasons");
    for (const code of emitted) assert.equal(rowsFor([{ code, message: "x" }]).length, 1, `${code} has no row in sponsorship-check.tsx`);
  });

  it("never states a visa outcome", () => {
    const r = scoreJob({ ...base, description: "Salary Range £48,500" });
    assert.ok(r.reasons.every((x) => !/you will (get|be granted)|guarantee|you qualify|eligible for a visa/i.test(x.message)));
  });
});

/** A reading as the reader would store it: everything not stated unless a test says otherwise. */
const reading = (over: Partial<Reading> = {}): Reading => ({
  sponsorship: { status: "not_mentioned", verified: true, quotes: [] },
  contract: { type: "not_stated", fixedTermMonths: null, quote: null },
  hours: { pattern: "not_stated", hoursPerWeek: null, quote: null },
  salary: null,
  experience: { level: "not_stated", minYears: null, quote: null },
  closingDate: null,
  location: { place: "not_stated", quote: null },
  socCode: null,
  field: null,
  ...over,
});
const salary = (min: number, max = min): Reading["salary"] => ({ min, max, period: "year", basis: "not_stated", upToOnly: false, quote: `£${min}` });
const dev = { ...base, title: "Software Developer" };

describe("scoreJob with the AI reader's facts", () => {
  it("rules out a job whose ad says no, wherever it says it", () => {
    const no = reading({ sponsorship: { status: "not_offered", verified: true, quotes: ["VISA SPONSORSHIP DOES NOT APPLY TO THIS ROLE"] } });
    const nhs = { ...base, title: "Staff Nurse", sector: "healthcare", isNhsJobs: true, salaryText: "Band 5", description: "Applications from job seekers who require current Skilled worker sponsorship to work in the UK are welcome." };
    const r = scoreJob({ ...nhs, reading: no });
    assert.equal(r.sponsorability, "ineligible");
    assert.match(r.reasons.find((x) => x.code === "ad_says_no_sponsorship")!.message, /DOES NOT APPLY TO THIS ROLE/);
  });

  it("asks people to check when the 'no' couldn't be confirmed, and never makes it green", () => {
    const r = scoreJob({ ...dev, salaryText: "£50,000", reading: reading({ sponsorship: { status: "not_offered", verified: false, quotes: [] } }) });
    assert.equal(r.sponsorability, "check_with_employer");
    assert.ok(codes(r).includes("ad_no_sponsorship_unconfirmed"));
  });

  it("asks people to check when the ad's yes or no depends on conditions", () => {
    for (const status of ["offered_with_conditions", "not_offered_with_conditions"] as const) {
      const r = scoreJob({ ...dev, salaryText: "£50,000", reading: reading({ sponsorship: { status, verified: true, quotes: ["Please be advised we are unable to provide Skilled Worker Visa Sponsorship to non-UK residents."] } }) });
      assert.equal(r.sponsorability, "check_with_employer", status);
      assert.ok(codes(r).includes("ad_sponsorship_conditional"), status);
    }
  });

  it("still listens to the phrase rules when the reader missed a 'no'", () => {
    assert.equal(scoreJob({ ...dev, salaryText: "£50,000", description: "We are unable to offer visa sponsorship.", reading: reading() }).sponsorability, "ineligible");
  });

  it("rules out casual, short and freelance contracts the reader found", () => {
    for (const type of ["bank", "locum", "sessional", "zero_hours", "temporary", "contractor", "self_employed", "internship", "apprenticeship"] as const) {
      const r = scoreJob({ ...dev, salaryText: "£50,000", reading: reading({ contract: { type, fixedTermMonths: null, quote: "x" } }) });
      assert.equal(r.sponsorability, "ineligible", type);
      assert.ok(codes(r).includes("contract_not_sponsorable"), type);
    }
  });

  it("accepts permanent and fixed-term of 12 months or more, and rules out shorter fixed terms", () => {
    const fixed = (months: number | null) => scoreJob({ ...dev, salaryText: "£50,000", reading: reading({ contract: { type: "fixed_term", fixedTermMonths: months, quote: "x" } }) }).sponsorability;
    assert.equal(fixed(24), "likely_eligible");
    assert.equal(fixed(12), "likely_eligible");
    assert.equal(fixed(6), "ineligible");
    // Length not stated: not stated doesn't block (founder's rule, 2026-10-28).
    assert.equal(fixed(null), "likely_eligible");
  });

  it("rules out part-time work the reader found, and accepts 'full or part time'", () => {
    const hours = (pattern: Reading["hours"]["pattern"]) => scoreJob({ ...dev, salaryText: "£50,000", reading: reading({ hours: { pattern, hoursPerWeek: null, quote: "x" } }) });
    assert.equal(hours("part_time").sponsorability, "ineligible");
    assert.ok(codes(hours("part_time")).includes("part_time"));
    assert.equal(hours("full_or_part_time").sponsorability, "likely_eligible");
    assert.equal(hours("not_stated").sponsorability, "likely_eligible");
  });

  it("uses the salary the reader found when the board gives none, and an 'up to' figure as a ceiling only", () => {
    assert.equal(scoreJob({ ...dev, reading: reading({ salary: salary(45000) }) }).salaryAnnualMin, 45000);
    assert.equal(scoreJob({ ...dev, reading: reading({ salary: salary(45000) }) }).sponsorability, "likely_eligible");
    const upTo = scoreJob({ ...dev, reading: reading({ salary: { ...salary(60000)!, upToOnly: true } }) });
    assert.deepEqual([upTo.sponsorability, upTo.salaryAnnualMin, upTo.salaryAnnualMax], ["check_with_employer", null, 60000]);
  });

  it("checks pay against both the new-entrant rate and the general rate", () => {
    // Software developers: new-entrant £38,300; general £54,700 (higher of £41,700 and the going rate).
    const mid = scoreJob({ ...dev, salaryText: "£45,000" });
    assert.deepEqual([mid.meetsNewEntrantRate, mid.meetsGeneralRate], [true, false]);
    assert.ok(codes(mid).includes("salary_below_general"));
    const high = scoreJob({ ...dev, salaryText: "£60,000" });
    assert.deepEqual([high.meetsNewEntrantRate, high.meetsGeneralRate], [true, true]);
    assert.ok(codes(high).includes("salary_meets_general"));
    const low = scoreJob({ ...dev, salaryText: "£30,000" });
    assert.deepEqual([low.sponsorability, low.meetsNewEntrantRate, low.meetsGeneralRate], ["ineligible", false, false]);
    const none = scoreJob(dev);
    assert.deepEqual([none.meetsNewEntrantRate, none.meetsGeneralRate], [null, null]);
    // NHS Band 5+ in a pay-scale occupation meets both.
    const nurse = scoreJob({ ...base, title: "Staff Nurse", sector: "healthcare", isNhsJobs: true, salaryText: "Band 5" });
    assert.deepEqual([nurse.meetsNewEntrantRate, nurse.meetsGeneralRate], [true, true]);
  });

  it("prefers the reader's occupation and field, and reports its experience and closing date", () => {
    const r = scoreJob({ ...base, title: "Associate", salaryText: "£50,000", reading: reading({ socCode: "2134", field: "software", experience: { level: "experienced", minYears: 3, quote: "x" }, closingDate: "2026-11-02" }) });
    assert.deepEqual([r.socCode, r.field, r.experienceLevel, r.experienceMinYears, r.closingDate, r.read], ["2134", "software", "experienced", 3, "2026-11-02", true]);
    assert.ok(codes(r).includes("experience_required"));
  });

  it("marks a job without a reading as unread, and falls back to the rules", () => {
    const r = scoreJob({ ...dev, salaryText: "£50,000" });
    assert.deepEqual([r.read, r.sponsorability, r.experienceLevel], [false, "likely_eligible", null]);
  });

  it("never makes an unregistered employer's offer green", () => {
    const r = scoreJob({ ...dev, licensedSponsor: false, salaryText: "£50,000", reading: reading({ sponsorship: { status: "offered", verified: true, quotes: ["We can sponsor visas."] } }) });
    assert.equal(r.sponsorability, "unknown");
  });

  it("makes a confirmed offer green when every rule passes", () => {
    const r = scoreJob({ ...dev, salaryText: "£50,000", reading: reading({ sponsorship: { status: "offered", verified: true, quotes: ["We can sponsor visas."] } }) });
    assert.equal(r.sponsorability, "sponsorship_mentioned");
    assert.match(r.reasons.find((x) => x.code === "ad_mentions_sponsorship")!.message, /We can sponsor visas/);
  });

  it("doesn't list a job based abroad, whether the reader or the stored location shows it", () => {
    const abroad = scoreJob({ ...dev, salaryText: "£50,000", reading: reading({ location: { place: "abroad", quote: "This is a remote position based in Victoria, Australia." } }) });
    assert.equal(abroad.sponsorability, "ineligible");
    assert.match(abroad.reasons.find((r) => r.code === "location_outside_uk")!.message, /Victoria, Australia/);
    assert.equal(scoreJob({ ...dev, salaryText: "£50,000", locationText: "Zurich, Switzerland" }).sponsorability, "ineligible");
    assert.equal(scoreJob({ ...dev, salaryText: "£50,000", locationText: "Dublin, Ireland; London" }).sponsorability, "likely_eligible");
    assert.equal(scoreJob({ ...dev, salaryText: "£50,000", reading: reading({ location: { place: "uk_or_abroad", quote: "x" } }) }).sponsorability, "likely_eligible");
  });

  it("scores readings stored before the location fact existed", () => {
    const older: Partial<Reading> = reading();
    delete older.location;
    assert.equal(scoreJob({ ...dev, salaryText: "£50,000", reading: older as Reading }).sponsorability, "likely_eligible");
  });
});
