import type { ChMatch } from "./companies-house";
import { knownEmployerSector } from "./known-employers";
import {
  IN_SCOPE_SECTORS,
  isLikelyCareProvider,
  isNhsBody,
  priorityScore,
  sectorFromName,
  sectorFromSicCodes,
  type Sector,
  type SectorSource,
} from "./sectors";

export type TaggableSponsor = {
  id: number;
  name: string;
  isSkilledWorker: boolean;
  workerRating: string | null;
};

export type SponsorTags = {
  id: number;
  sector: Sector | null;
  sectorSource: SectorSource | null;
  inScope: boolean;
  sicCodes: string[] | null;
  companyNumber: string | null;
  matchConfidence: number | null;
  sizeBand: number;
  priorityScore: number;
};

const NAME_KEYWORD_CONFIDENCE = 0.3;

/** NHS name rules, then the known-employers list, then Companies House SIC codes, then name keywords. */
export function tagSponsor(sponsor: TaggableSponsor, match: ChMatch | null): SponsorTags {
  let sector: Sector | null = null;
  let sectorSource: SectorSource | null = null;
  let confidence: number | null = match?.confidence ?? null;
  let sizeBand = match?.company.sizeBand ?? 0;

  const known = knownEmployerSector(sponsor.name);
  if (isNhsBody(sponsor.name)) {
    sector = "healthcare";
    sectorSource = "nhs_name";
    confidence = 1;
    sizeBand = 3; // NHS trusts and boards are all large employers
  } else if (known) {
    sector = known;
    sectorSource = "known_employer";
    confidence = 1;
    sizeBand = 3;
  } else if (match && match.company.sicCodes.length > 0) {
    sector = sectorFromSicCodes(match.company.sicCodes);
    if (sector === "healthcare" && isLikelyCareProvider(sponsor.name, match.company.sicCodes)) sector = "other";
    sectorSource = "sic";
  } else {
    sector = sectorFromName(sponsor.name);
    if (sector) {
      sectorSource = "name_keyword";
      confidence = NAME_KEYWORD_CONFIDENCE;
    }
  }

  const inScope = sponsor.isSkilledWorker && sector !== null && IN_SCOPE_SECTORS.has(sector);
  return {
    id: sponsor.id,
    sector,
    sectorSource,
    inScope,
    sicCodes: match?.company.sicCodes.length ? match.company.sicCodes : null,
    companyNumber: match?.company.number ?? null,
    matchConfidence: confidence,
    sizeBand,
    priorityScore: priorityScore({
      inScope,
      sizeBand,
      workerRating: sponsor.workerRating,
      matchConfidence: confidence ?? 0,
    }),
  };
}
