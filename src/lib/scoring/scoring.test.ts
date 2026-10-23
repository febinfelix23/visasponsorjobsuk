import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOccupation } from "./occupations";
import { annualise, parseSalary, salaryFromDescription } from "./salary";
import { scoreJob, type ScoreInput } from "./score";
import { classifySeniority, yearsRequired } from "./seniority";
import { sponsorshipSignal } from "./signals";
import { classifyOccupation, CLASSIFIER_CODES } from "./soc";

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
    assert.equal(classifySeniority("Staff Nurse", null, "Band 5 · £32,073 to £39,043 a year").seniority, "entry");
    assert.equal(classifySeniority("Backend Engineer", "You have 5+ years of professional experience").seniority, "senior");
  });

  it("reads required experience", () => {
    assert.equal(yearsRequired("2-3 years of commercial experience"), 2);
    assert.equal(yearsRequired("At least 3 years’ relevant experience"), 3);
    assert.equal(yearsRequired("no experience needed"), null);
  });
});

describe("sponsorshipSignal", () => {
  it("finds explicit yes and no statements, with no winning", () => {
    assert.ok(sponsorshipSignal("Applications from job seekers who require current Skilled worker sponsorship to work in the UK are welcome and will be considered").positive);
    assert.ok(sponsorshipSignal("Visa sponsorship is available for this role.").positive);
    assert.ok(sponsorshipSignal("Please note visa sponsorship for this role is unfortunately not available.").negative);
    assert.ok(sponsorshipSignal("We are unable to offer visa sponsorship.").negative);
    assert.ok(sponsorshipSignal("You must be able to work in the UK without sponsorship").negative);
    const both = sponsorshipSignal("We offer great benefits. We cannot offer sponsorship for this role.");
    assert.ok(both.negative);
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
    assert.equal(scoreJob({ ...base, licensedSponsor: false, description: "Visa sponsorship is available." }).sponsorability, "sponsorship_mentioned");
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

  it("rules out self-employed roles and holds back bank/locum ones (spot-check regressions)", () => {
    assert.equal(scoreJob({ ...base, title: "Field Sales Consultant (Self-employed)", salaryText: "£60,000" }).sponsorability, "ineligible");
    const gp = { ...base, sector: "healthcare", isNhsJobs: true, salaryText: "Band 6 · NHS" };
    assert.equal(scoreJob({ ...gp, title: "Staff Nurse" }).sponsorability, "likely_eligible");
    assert.equal(scoreJob({ ...gp, title: "Locum GP" }).sponsorability, "check_with_employer");
    assert.equal(scoreJob({ ...gp, title: "Bank Nurse - HMP Liverpool" }).sponsorability, "check_with_employer");
    assert.equal(scoreJob({ ...gp, title: "Staff Nurse", employmentType: "Bank" }).sponsorability, "check_with_employer");
  });

  it("rules out contractors and body-only self-employed roles (spot-check regressions)", () => {
    assert.equal(scoreJob({ ...base, title: "Software Developer - Consultant (Contract)", employmentType: "Contract - Contingent Day Rate", salaryText: "£60,000" }).sponsorability, "ineligible");
    assert.equal(scoreJob({ ...base, title: "Payment Consultant", description: "This is a self-employed role. Earn £143,000 OTE." }).sponsorability, "ineligible");
  });

  it("only uses the NHS pay-scale shortcut for NHS posts", () => {
    const pharma = { ...base, title: "Senior Clinical Research Physician", sector: "healthcare", sponsorName: "GSK Plc", description: "Experience of NHS clinical practice preferred." };
    assert.equal(scoreJob(pharma).sponsorability, "check_with_employer");
    assert.equal(scoreJob({ ...pharma, salaryText: "£120,000" }).sponsorability, "likely_eligible");
  });

  it("never states a visa outcome", () => {
    const r = scoreJob({ ...base, description: "Salary Range £48,500" });
    assert.ok(r.reasons.every((x) => !/you will (get|be granted)|guarantee|you qualify|eligible for a visa/i.test(x.message)));
  });
});
