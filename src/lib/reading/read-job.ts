import Anthropic from "@anthropic-ai/sdk";
import { FIELDS } from "@/lib/scoring/fields";
import occupations from "@/lib/scoring/skilled-occupations.json";
import { parseReading, READING_SCHEMA, type Reading } from "./schema";

/**
 * The AI reader: one call per ad, made when the ad is new or its text changes. It
 * reports facts with quotes; parseReading keeps only facts whose quotes are in the ad.
 */

export const READER_MODEL = "claude-haiku-5-5";

export type ReaderJob = {
  title: string;
  employer: string;
  employmentType: string | null;
  salaryText: string | null;
  closingDate: string | null;
  description: string | null;
};

const boardFields = (job: ReaderJob) => ({
  contract_and_working_pattern: job.employmentType,
  salary: job.salaryText,
  closing_date: job.closingDate,
});

/** What the model reads: the board's own fields, then the whole ad. */
export function readerInput(job: ReaderJob): string {
  return JSON.stringify({ title: job.title, employer: job.employer, board_fields: boardFields(job), ad: job.description ?? "" });
}

/** Quotes may come from the board's fields ("Part-time" on NHS Jobs) as well as the ad. */
export function quoteSource(job: ReaderJob): string {
  return [job.title, ...Object.values(boardFields(job)), job.description].filter(Boolean).join("\n");
}

const OCCUPATION_LIST = Object.entries(occupations.occupations as Record<string, { title: string }>)
  .map(([soc, o]) => `${soc} ${o.title}`)
  .join("\n");

const INSTRUCTIONS = `You read UK job adverts for a job board that lists jobs open to Skilled Worker visa sponsorship, for people already in the UK. Read the whole advert, including the board fields, and report facts. Report only what the advert says: never infer, never guess, never use outside knowledge about the employer.

Every fact you report needs a quote: words copied exactly from the input, as a continuous phrase of at least a few words. If the advert doesn't state a fact, use "not_stated" (or null) and a null quote. A fact with a quote that isn't in the input is thrown away.

sponsorship.status, from everything the advert says about visa sponsorship, Certificates of Sponsorship (CoS), Skilled Worker or Health and Care visas, or the right to work:
- "not_offered": the advert says this role can't be sponsored, in any wording ("visa sponsorship does not apply to this role", "unable to offer a certificate of sponsorship for this post", "this role is not eligible for sponsorship", "you must have the right to work without sponsorship", "we do not sponsor visas for this programme"). A "no" anywhere wins over any "yes" elsewhere, including NHS Jobs' standard statement.
- "not_offered_with_conditions": a "no" that depends on the applicant or the circumstances ("unable to sponsor non-UK residents", "will not sponsor where the salary doesn't meet the threshold", "not all roles are eligible for sponsorship", "band 2 and 3 roles are no longer eligible").
- "offered": the advert says sponsorship is available for this role ("visa sponsorship available", "we can sponsor", NHS Jobs' statement "Applications from job seekers who require current Skilled worker sponsorship to work in the UK are welcome").
- "offered_with_conditions": a maybe ("sponsorship may be considered for exceptional candidates", "case by case").
- "not_mentioned": nothing about sponsorship. A plain "you must have the right to work in the UK" with no mention of sponsorship is "not_mentioned".
- Ignore questions on application forms ("Will you require sponsorship?") and sponsorship that isn't about visas (export licences, GMC registration, training funding).
- quotes: every sentence about sponsorship, the yes and the no.

contract.type: "permanent"; "fixed_term" (fixed_term_months when stated: a 2-year contract is 24; secondments and maternity cover are fixed_term); "bank", "locum", "sessional", "zero_hours", "temporary" (temporary or interim cover, agency temp), "contractor" (day rate, umbrella, outside IR35), "self_employed" (self-employed, freelance, commission-only), "internship" (internships and placements), "apprenticeship"; or "not_stated".

hours.pattern: "full_time", "part_time" (any stated hours under 35 a week, "0.6 WTE", a set number of sessions, job share), "full_or_part_time" (the advert offers either), or "not_stated". "Pro rata" alone is not evidence of part-time: NHS salaries say it on full-time posts. hours_per_week when stated.

salary: the base pay for this role. min and max as numbers (£45k = 45000), period, basis "actual" (the pay received for the stated hours, "Actual £22,000") or "full_time_equivalent" (a full-time figure that is pro-rated) or "not_stated"; up_to_only true when only a top figure is given ("up to £50,000"). Leave out bonuses, commission, on-target earnings, allowances, London weighting and equity. If several salaries are given (by location or level), min is the lowest and max the highest. All null when no salary is given.

experience.level: "graduate_or_entry" (graduate schemes, entry level, newly qualified, no experience needed), "some_experience" (up to about 2 years asked for), "experienced" (3 or more years, or "proven experience" in the role), "senior" (senior, lead, principal, head of, consultant doctor, manager of a team), or "not_stated". min_years when a number of years is asked for. Read the person specification's essential criteria too.

closing_date.date: the application deadline as YYYY-MM-DD when stated, with its quote.

occupation.soc: the best-fitting SOC 2020 code from the list below for the work itself (not the employer's industry), or "" when none fits. occupation.field: the kind of work.

Fields:
${FIELDS.map((f) => `- ${f.key}: ${f.describe}`).join("\n")}

SOC 2020 codes (code, then occupation):`;

export type ReadingUsage = { inputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; outputTokens: number };

/** Claude Haiku 5.5 list prices: $0.10/M input, $0.50/M output; cache reads 0.1x, 5-minute cache writes 1.25x. */
export const readingCostUsd = (u: ReadingUsage) =>
  Math.round((u.inputTokens * 0.1 + u.cacheReadTokens * 0.01 + u.cacheWriteTokens * 0.125 + u.outputTokens * 0.5)) / 1_000_000;

export class ReaderUnavailableError extends Error {}

export function createJobReader(options: { apiKey?: string } = {}) {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const usage: ReadingUsage & { requests: number } = { requests: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };

  /** The checked reading (null when the model gave no usable answer; the job waits for the next run) and what the call cost. */
  async function read(job: ReaderJob): Promise<{ reading: Reading | null; costUsd: number }> {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: READER_MODEL,
        max_tokens: 8000,
        output_config: { effort: "medium", format: { type: "json_schema", schema: READING_SCHEMA } },
        system: [
          { type: "text", text: INSTRUCTIONS },
          // Identical on every request, so it's cached after the first.
          { type: "text", text: OCCUPATION_LIST, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: readerInput(job) }],
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new ReaderUnavailableError("Anthropic API key rejected");
      }
      if (error instanceof Anthropic.APIError && error.status === 402) {
        throw new ReaderUnavailableError("Anthropic credit exhausted or spend limit reached");
      }
      // A malformed request fails the same way for every job: stop rather than skip them all.
      if (error instanceof Anthropic.BadRequestError) throw new ReaderUnavailableError(`Request rejected: ${error.message.slice(0, 200)}`);
      return { reading: null, costUsd: 0 };
    }
    const call: ReadingUsage = {
      inputTokens: response.usage.input_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      outputTokens: response.usage.output_tokens,
    };
    usage.requests++;
    for (const k of Object.keys(call) as (keyof ReadingUsage)[]) usage[k] += call[k];
    const costUsd = readingCostUsd(call);
    if (response.stop_reason !== "end_turn") return { reading: null, costUsd };
    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    return { reading: parseReading(text, quoteSource(job)), costUsd };
  }

  return { read, usage, costUsd: () => readingCostUsd(usage) };
}
