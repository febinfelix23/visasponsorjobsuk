/** One job as an adapter sees it, before scoring. Only UK jobs are returned. */
export type RawJob = {
  /** Stable ID within the source (ATS job ID, NHS reference). */
  externalId: string;
  title: string;
  applyUrl: string;
  /** Every location the ad lists, joined for display ("London; Manchester"). */
  locationText: string | null;
  isRemote: boolean;
  postedAt: Date | null;
  closingDate: string | null;
  employmentType: string | null;
  department: string | null;
  salaryText: string | null;
  /** Structured pay when the ATS provides it; parsed from salaryText otherwise (Phase 0.6). */
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: "year" | "month" | "week" | "day" | "hour" | null;
  /**
   * Plain-text description. `undefined` means "not fetched this time" (adapters skip
   * detail requests for jobs they've already stored), so the stored value is kept.
   */
  description: string | undefined;
  /** Employer as advertised; used to match shared boards (NHS Jobs) to sponsors. */
  employerName: string | null;
  /**
   * True when only list-level fields were fetched (detail skipped for an already-stored
   * job): the pipeline then just marks the job as still live and keeps its stored details.
   */
  partial: boolean;
};

export type SourceRef = {
  id: number;
  ats: "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workable" | "workday" | "nhs_jobs";
  identifier: string;
  careersUrl: string | null;
  discovery: Record<string, unknown> | null;
};

export type AdapterContext = {
  /** External IDs already stored for this source; adapters skip detail requests for these. */
  knownIds: ReadonlySet<string>;
};

export type Adapter = (source: SourceRef, ctx: AdapterContext) => Promise<RawJob[]>;

export const emptyJob = (fields: Pick<RawJob, "externalId" | "title" | "applyUrl"> & Partial<RawJob>): RawJob => ({
  locationText: null,
  isRemote: false,
  postedAt: null,
  closingDate: null,
  employmentType: null,
  department: null,
  salaryText: null,
  salaryMin: null,
  salaryMax: null,
  salaryPeriod: null,
  description: undefined,
  employerName: null,
  partial: false,
  ...fields,
});
