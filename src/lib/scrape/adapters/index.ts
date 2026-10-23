import type { Adapter, SourceRef } from "../types";
import { ashby } from "./ashby";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { nhsJobs } from "./nhs-jobs";
import { smartrecruiters } from "./smartrecruiters";
import { workday } from "./workday";

export const ADAPTERS: Partial<Record<SourceRef["ats"], Adapter>> = {
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
  workday,
  nhs_jobs: nhsJobs,
};
