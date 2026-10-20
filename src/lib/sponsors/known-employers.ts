import type { Sector } from "./sectors";

/**
 * Major UK graduate employers whose Companies House data doesn't reveal their
 * sector: LLPs file no SIC codes (the Big 4), and many multinationals register
 * under generic codes like 70100 "head office" or 82990 "business support".
 *
 * Patterns are matched against the sponsor's name as it appears on the register,
 * anchored at the start, and kept specific so "Atkins Brickwork" doesn't match AtkinsRéalis.
 */
export const KNOWN_EMPLOYERS: [RegExp, Sector][] = [
  // Finance: audit, tax, banking, markets
  [/^deloitte llp\b/i, "finance"],
  [/^pricewaterhousecoopers\b/i, "finance"],
  [/^kpmg\b/i, "finance"],
  [/^ernst (&|and) young\b/i, "finance"],
  [/^grant thornton\b/i, "finance"],
  [/^bdo llp\b/i, "finance"],
  [/^(forvis )?mazars\b/i, "finance"],
  [/^crowe u\.?k\.? llp\b/i, "finance"],
  [/^rsm uk\b/i, "finance"],
  [/^morgan stanley\b/i, "finance"],
  [/^hsbc\b/i, "finance"],
  [/^(jpmorgan|j\.?\s?p\.? morgan)\b/i, "finance"],
  [/^banco santander\b/i, "finance"],
  [/^bernstein autonomous\b/i, "finance"],
  [/^citi(bank|group)\b/i, "finance"],
  [/^blackrock\b/i, "finance"],
  [/^schroders?\b/i, "finance"],
  [/^standard chartered\b/i, "finance"],
  [/^ubs\b/i, "finance"],
  [/^deutsche bank\b/i, "finance"],
  [/^bnp paribas\b/i, "finance"],
  [/^soci[eé]t[eé] g[eé]n[eé]rale\b/i, "finance"],
  [/^nomura\b/i, "finance"],
  [/^jane street\b/i, "finance"],
  [/^citadel\b/i, "finance"],
  [/^edf trading\b/i, "finance"],
  // Tech
  [/^accenture\b/i, "tech"],
  [/^google\b/i, "tech"],
  [/^amazon (uk services|web services|development centre|data services)\b/i, "tech"],
  [/^apple europe\b/i, "tech"],
  [/^(facebook uk|meta platforms)\b/i, "tech"],
  [/^ibm (uk|united kingdom)\b/i, "tech"],
  [/^hcl technologies\b/i, "tech"],
  [/^tech mahindra\b/i, "tech"],
  [/^wipro limited\b/i, "tech"],
  [/^infosys limited\b/i, "tech"],
  [/^bloomberg\b/i, "tech"],
  [/^oracle corporation uk\b/i, "tech"],
  [/^salesforce\b/i, "tech"],
  [/^cisco\b/i, "tech"],
  [/^arm limited\b/i, "tech"],
  [/^ocado\b/i, "tech"],
  // Healthcare: pharma, private hospitals, pharmacy chains
  [/^(gsk plc|glaxosmithkline)\b/i, "healthcare"],
  [/^astrazeneca\b/i, "healthcare"],
  [/^pfizer\b/i, "healthcare"],
  [/^roche (products|diagnostics)\b/i, "healthcare"],
  [/^novartis\b/i, "healthcare"],
  [/^sanofi\b/i, "healthcare"],
  [/^(eli lilly|merck sharp|msd )\b/i, "healthcare"],
  [/^johnson (&|and) johnson\b/i, "healthcare"],
  [/^ramsay health care uk\b/i, "healthcare"],
  [/^(bmi healthcare|circle health)\b/i, "healthcare"],
  [/^nuffield health\b/i, "healthcare"],
  [/^hca (international|healthcare uk)\b/i, "healthcare"],
  [/^spire healthcare\b/i, "healthcare"],
  [/^boots uk\b/i, "healthcare"],
  // Engineering
  [/^(atkinsr[eé]alis|ws atkins)\b/i, "engineering"],
  [/^jacobs u\.?k\.?\b/i, "engineering"],
  [/^stantec uk\b/i, "engineering"],
  [/^babcock\b/i, "engineering"],
  [/^balfour beatty\b/i, "engineering"],
  [/^siemens (plc|holdings)\b/i, "engineering"],
  [/^mbda\b/i, "engineering"],
  [/^national grid\b/i, "engineering"],
  [/^edf energy\b/i, "engineering"],
  [/^network rail\b/i, "engineering"],
  [/^wsp\b/i, "engineering"],
  [/^laing o'?rourke\b/i, "engineering"],
  [/^costain\b/i, "engineering"],
  [/^jaguar land rover\b/i, "engineering"],
  [/^shell (uk|u\.k\.|international|energy|research)\b/i, "engineering"],
  [/^bp (p\.?l\.?c\.?|international|exploration)\b/i, "engineering"],
  [/^sellafield\b/i, "engineering"],
  [/^qinetiq\b/i, "engineering"],
  [/^renishaw\b/i, "engineering"],
  [/^octopus energy\b/i, "engineering"],
  [/^(ørsted|orsted)\b/i, "engineering"],
];

export function knownEmployerSector(name: string): Sector | null {
  for (const [pattern, sector] of KNOWN_EMPLOYERS) if (pattern.test(name)) return sector;
  return null;
}
