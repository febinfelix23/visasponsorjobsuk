/**
 * Job title → SOC 2020 occupation code, by ordered keyword rules covering the four
 * sectors. First match wins, so specific rules sit above general ones. Titles that
 * match nothing stay unclassified (badge "Check with employer"); an AI fallback for
 * those can come later.
 */

type Rule = { soc: string; pattern: RegExp; sectors?: string[] };

const RULES: Rule[] = [
  // Not sponsorable graduate roles: catch them before "engineer"/"nurse" rules do.
  { soc: "6131", pattern: /\b(health ?care assistant|hca|nursing assistant|auxiliary nurse|health care support worker|clinical support worker)\b/ },
  { soc: "6135", pattern: /\b(care worker|carer|support worker|care assistant)\b/ },

  { soc: "2135", pattern: /\b(information security officer|threat intelligence|security operations (analyst|engineer|centre|center))\b/ },
  { soc: "9231", pattern: /\b(security officer|patrol officer|door supervisor|cctv operator|security guard)\b/ },

  // Healthcare: doctors
  { soc: "2212", pattern: /\b(consultant (in|physician|surgeon|anaesthetist|psychiatrist|radiologist|paediatrician)|consultant$|anaesthetist|surgeon|psychiatrist|radiologist|oncologist|cardiologist|paediatrician|dermatologist|histopathologist)\b/, sectors: ["healthcare"] },
  { soc: "2211", pattern: /\b(doctor|physician|foundation (year|doctor|programme)|fy ?[12]|f[12] doctor|junior clinical fellow|clinical fellow|trust (grade|doctor)|sho|senior house officer|registrar|specialty doctor|speciality doctor|staff grade|locum|core trainee|ct[1-3]|st[1-8]|gp|general practitioner|medical officer|salaried gp)\b/, sectors: ["healthcare"] },
  { soc: "2253", pattern: /\b(dentist|dental (surgeon|officer|practitioner)|orthodontist)\b/ },
  // Healthcare: nursing and midwifery
  { soc: "2231", pattern: /\b(midwife|midwives|midwifery)\b/ },
  { soc: "2235", pattern: /\b(mental health nurse|psychiatric nurse|rmn)\b/ },
  { soc: "2236", pattern: /\b(children'?s nurse|paediatric nurse|neonatal nurse|rsc?n)\b/ },
  { soc: "2234", pattern: /\b(nurse practitioner|advanced clinical practitioner|acp)\b/ },
  { soc: "2233", pattern: /\b(specialist nurse|nurse specialist|intensive care nurse|itu nurse|icu nurse|theatre nurse|scrub nurse)\b/ },
  { soc: "2232", pattern: /\b(district nurse|community nurse|practice nurse|health visitor|school nurse)\b/ },
  { soc: "2237", pattern: /\b(staff nurse|registered nurse|rgn|nurse|ward sister|charge nurse)\b/ },
  // Healthcare: allied health and pharmacy
  { soc: "2221", pattern: /\bphysio(therapist)?\b/ },
  { soc: "2222", pattern: /\boccupational therapist\b/ },
  { soc: "2223", pattern: /\b(speech (and|&) language therapist|slt)\b/ },
  { soc: "2225", pattern: /\b(clinical psychologist)\b/ },
  { soc: "2224", pattern: /\b(psychotherapist|cbt therapist|cognitive behavioural therapist|counsellor)\b/, sectors: ["healthcare"] },
  { soc: "2251", pattern: /\bpharmacist\b/ },
  { soc: "3212", pattern: /\bpharmacy technician\b/ },
  { soc: "2252", pattern: /\b(optometrist|ophthalmic optician)\b/ },
  { soc: "2254", pattern: /\b(radiographer|sonographer|nuclear medicine)\b/ },
  { soc: "2255", pattern: /\bparamedic\b/ },
  { soc: "2256", pattern: /\b(podiatrist|chiropodist)\b/ },
  { soc: "2259", pattern: /\b(audiologist|dietitian|dietician|clinical physiologist|orthoptist|prosthetist|orthotist)\b/ },
  { soc: "2113", pattern: /\b(biomedical scientist|biochemist|biotechnologist)\b/ },
  { soc: "2112", pattern: /\b(biologist|microbiologist|immunologist)\b/ },
  { soc: "2114", pattern: /\b(chemist|physicist|geologist|geophysicist|hydrologist)\b/ },

  // Tech
  { soc: "2134", pattern: /\b(member of technical staff)\b/ },
  { soc: "2132", pattern: /\b(engineering manager|head of engineering)\b/, sectors: ["tech", "finance"] },
  { soc: "2433", pattern: /\b(data scientist|statistician|actuar(y|ial)|economist|quantitative (analyst|researcher)|quant (analyst|researcher|developer))\b/ },
  { soc: "2135", pattern: /\b(cyber|security (engineer|analyst|architect|consultant|specialist)|penetration tester|pen tester|soc analyst|infosec|appsec|devsecops)\b/ },
  { soc: "2136", pattern: /\b(qa|quality assurance|test (engineer|analyst|lead|automation)|tester|sdet)\b/ },
  { soc: "2133", pattern: /\b(data engineer|data architect|analytics engineer|solutions? architect|enterprise architect|cloud architect|technical architect|systems? architect|it business analyst|systems analyst|salesforce (developer|consultant|architect))\b/ },
  { soc: "2139", pattern: /\b(devops|dev ops|site reliability|sre|platform engineer|cloud engineer|infrastructure engineer|it consultant|technology consultant|technical consultant|webmaster)\b/ },
  { soc: "2137", pattern: /\b(network (engineer|architect|specialist))\b/ },
  { soc: "2134", pattern: /\b(software|front ?end|front-end|back ?end|back-end|full ?stack|full-stack|mobile (engineer|developer)|ios|android|web developer|developer|programmer|machine learning engineer|ml engineer|ai engineer|research engineer|game(s)? (developer|programmer)|embedded (software|engineer)|swe)\b/ },
  { soc: "2141", pattern: /\b(ux|ui|product designer|interaction designer|user researcher|service designer|web designer)\b/ },
  { soc: "2142", pattern: /\b(graphic designer|motion designer|multimedia|animator)\b/ },
  { soc: "2132", pattern: /\b(product manager|product owner|it manager|head of it)\b/ },
  { soc: "2131", pattern: /\b(it project manager|technical project manager|technical program(me)? manager|delivery manager|scrum master)\b/ },
  { soc: "3131", pattern: /\b(systems? administrator|sysadmin|network administrator|it operations|noc)\b/ },
  { soc: "3132", pattern: /\b(it support|service desk|help ?desk|desktop support|technical support)\b/ },

  // Sales, marketing and commercial (before finance/engineering so "Sales Engineer" style titles land here)
  { soc: "1132", pattern: /\b(sales director|marketing director|vp,? sales|head of sales|head of marketing|chief (revenue|marketing) officer)\b/ },
  { soc: "3552", pattern: /\b(account executive|sales executive|sales development representative|business development representative|sdr|bdr|inside sales)\b/ },
  { soc: "3556", pattern: /\b(account manager|key account|business development manager|customer success manager|partnerships? manager|sales manager|account director|brand manager|customer success)\b/ },
  { soc: "2432", pattern: /\b(marketing manager|product marketing|growth manager|commercial manager|head of commercial)\b/ },
  { soc: "3554", pattern: /\b(marketing executive|marketing assistant|content marketing|social media (executive|manager)|seo (executive|specialist))\b/ },
  // Legal and people
  { soc: "2412", pattern: /\b(solicitor|lawyer|legal counsel|general counsel|in-house counsel|counsel)\b/ },
  { soc: "2419", pattern: /\b(paralegal|legal executive|litigation executive)\b/ },
  { soc: "1136", pattern: /\b(hr business partner|people partner|hr manager|head of people|people manager|talent acquisition (manager|partner|lead))\b/ },
  { soc: "3571", pattern: /\b(recruiter|recruitment consultant|talent acquisition|hr advisor|hr adviser|people advisor)\b/ },

  // Finance
  { soc: "1131", pattern: /\b(financial controller|finance director|head of finance|cfo)\b/ },
  { soc: "3534", pattern: /\b(finance manager|finance business partner|credit manager|investment manager)\b/ },
  { soc: "2423", pattern: /\b(tax (associate|adviser|advisor|consultant|manager|senior|analyst|trainee)|taxation)\b/ },
  { soc: "2421", pattern: /\b(accountant|audit(or)?|assurance (associate|trainee|senior)|aca|acca|cima|financial reporting|regulatory reporting)\b/ },
  { soc: "2422", pattern: /\b(financial analyst|investment analyst|investment banking|credit analyst|equity research|portfolio analyst|treasury analyst|fp&a|financial planning|wealth (manager|adviser|planner)|financial (adviser|advisor|planner)|mortgage adviser|underwriter|valuation)\b/ },
  { soc: "2431", pattern: /\b(business analyst|management consultant|strategy (consultant|analyst)|risk analyst|consultant)\b/ },
  { soc: "4122", pattern: /\b(bookkeeper|book-keeper|payroll|accounts (assistant|payable|receivable))\b/ },

  // Construction and surveying
  { soc: "2453", pattern: /\bquantity surveyor\b/ },
  { soc: "2454", pattern: /\b(building surveyor|land surveyor|chartered surveyor|geomatics surveyor|hydrographic surveyor)\b/ },
  { soc: "2455", pattern: /\b(construction (project )?manager|contracts? manager|site manager|transport planner)\b/ },
  { soc: "2452", pattern: /\b(town planner|planning officer|urban designer|architectural technologist)\b/ },
  { soc: "2440", pattern: /\b(project manager|programme manager|program manager|change manager|risk manager|pmo)\b/ },

  // Data analysts after finance, so "Financial Reporting Analyst" stays an accountancy role.
  { soc: "3544", pattern: /\b(data analyst|business intelligence analyst|bi analyst|product analyst|insights? analyst|reporting analyst|analytics analyst)\b/ },

  // Engineering (after tech so "software engineer" is already taken).
  // Technicians first: "Mechanical Technician" is a technician, not a mechanical engineer.
  { soc: "3113", pattern: /\b(engineering technician|maintenance technician|wind turbine technician|field service engineer|mechanical technician|technician)\b/, sectors: ["engineering"] },
  { soc: "3113", pattern: /\b(engineering technician|maintenance technician|wind turbine technician|mechanical technician)\b/ },
  { soc: "2126", pattern: /\b(aerospace|aeronautical|avionics|aircraft|propulsion|stress engineer)\b/ },
  { soc: "2121", pattern: /\b(civil|structural|geotechnical|building services|highways|bridge|drainage|water engineer|tunnel|hydraulic modeller|wastewater)\b/ },
  { soc: "2123", pattern: /\b(electrical|power systems|railway signalling|signalling engineer|high voltage|hv engineer)\b/ },
  { soc: "2124", pattern: /\b(electronics?|rf engineer|telecoms? engineer|hardware engineer|fpga|asic|pcb)\b/ },
  { soc: "2125", pattern: /\b(chemical engineer|process engineer|production engineer|manufacturing engineer|industrial engineer|control (and|&) instrumentation|c&i|automation engineer)\b/ },
  { soc: "2122", pattern: /\b(mechanical|automotive engineer|marine engineer|naval architect)\b/ },
  { soc: "2127", pattern: /\b(project engineer|engineering project manager)\b/ },
  { soc: "2152", pattern: /\b(environmental (engineer|consultant|scientist)|sustainability consultant|energy manager)\b/ },
  { soc: "3111", pattern: /\b(laboratory technician|lab technician)\b/ },
  { soc: "2129", pattern: /\b(design engineer|systems engineer|nuclear|materials engineer|acoustic|biomedical engineer|engineer)\b/, sectors: ["engineering"] },
  { soc: "2134", pattern: /\b(engineer)\b/, sectors: ["tech"] },
  // Last resort in finance: an unlabelled "Analyst" there is almost always a finance/investment analyst.
  { soc: "2422", pattern: /\banalyst\b/, sectors: ["finance"] },
];

const normalise = (title: string) =>
  ` ${title
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9&'+ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

export function classifyOccupation(title: string, sector: string | null): string | null {
  const text = normalise(title);
  for (const rule of RULES) {
    if (rule.sectors && (!sector || !rule.sectors.includes(sector))) continue;
    if (rule.pattern.test(text)) return rule.soc;
  }
  return null;
}

/** Every code the rules can return; a test checks each is in the official table. */
export const CLASSIFIER_CODES = [...new Set(RULES.map((r) => r.soc))];
