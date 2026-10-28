import Anthropic from "@anthropic-ai/sdk";
import { FIELDS, isFieldKey, type FieldKey } from "./fields";
import occupations from "./skilled-occupations.json";
import { getOccupation } from "./occupations";

/**
 * AI classification of jobs: field of work and SOC 2020 occupation code, read from
 * the title, employer and the first part of the ad. Keyword rules miss titles like
 * "Data Science Manager"; a model reading the job doesn't.
 */

export const CLASSIFY_MODEL = "claude-haiku-5-5";
export const BATCH_SIZE = 20;
/** Hard cap per run whatever the backlog: about 3,000 jobs is roughly $0.30 on Claude Haiku 5.5. */
export const DEFAULT_MAX_JOBS_PER_RUN = 3000;

/** How much of the ad the model reads: enough for the duties and requirements, not just the intro. */
export const AD_CHARS = 1_500;

export type ClassifyInput = { key: string; title: string; employer: string; employerIndustry: string | null; description: string | null };
export type Classification = { socCode: string | null; field: FieldKey | null };

const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Cache key: the title without bracketed extras ("(Manchester)", "(12 Month FTC)") plus the
 * employer. The same title can be different work at different employers ("Consultant",
 * "Associate"), so one answer is shared only within an employer.
 */
export function classificationKey(title: string, employer: string): string {
  return `v2|${normalise(title)}|${normalise(employer)}`;
}

/** The earlier key (title + employer's industry). Scoring falls back to it until a job is re-classified. */
export function legacyClassificationKey(title: string, employerIndustry: string | null): string {
  return `${normalise(title)}|${employerIndustry ?? ""}`;
}

const OCCUPATION_LIST = Object.entries(occupations.occupations as Record<string, { title: string }>)
  .map(([soc, o]) => `${soc} ${o.title}`)
  .join("\n");

const INSTRUCTIONS = `You classify UK job adverts for a job board for graduates seeking visa sponsorship.

Each job comes with its title, employer, the employer's industry and the first part of the ad. The title is the main evidence: when it names a clear occupation ("Registered Mental Health Nurse", "Physiotherapist", "Software Engineer"), use that occupation. Use the ad to decide only when the title is vague or could mean several kinds of work ("Associate", "Consultant", "Practitioner", "Specialist", "Fellow", "Operations"), or when the ad plainly describes different work from the title. Pick the most specific code that fits, not a general "not elsewhere classified" one.

For each job, decide:
1. field: what kind of work the job itself is, regardless of the employer's industry. A software engineer at a bank is "software"; a sales consultant at a clinic is "sales_marketing"; a data science manager is "data".
2. soc: the best-fitting SOC 2020 occupation code from the list below, or "" if none fits. Classify the work, not the seniority: a senior or lead role uses the same code as the junior one, unless the role is mainly managing people or a function (then use the relevant manager or director code).

Common cases:
- Sales development and business development representatives (SDR, BDR), account executives and sales executives are business sales executives (3552).
- Account managers, customer success managers, partnership managers and business development managers are sales accounts and business development managers (3556), not customer service.
- Product managers and product owners in technology are IT managers (2132); IT project and programme managers are 2131.
- Graduate schemes and trainee roles use the code of the work the scheme trains for.

Fields:
${FIELDS.map((f) => `- ${f.key}: ${f.describe}`).join("\n")}

Use only codes from this list (code, then occupation):`;

const SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          field: { type: "string", enum: FIELDS.map((f) => f.key) },
          soc: { type: "string" },
        },
        required: ["id", "field", "soc"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
} as const;

/** The model's JSON answer, keeping only known fields and codes that exist in the official table. */
export function parseClassifications(text: string, count: number): Map<number, Classification> {
  const out = new Map<number, Classification>();
  let parsed: { results?: { id?: unknown; field?: unknown; soc?: unknown }[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    return out;
  }
  for (const r of parsed.results ?? []) {
    if (typeof r.id !== "number" || !Number.isInteger(r.id) || r.id < 0 || r.id >= count) continue;
    const soc = typeof r.soc === "string" && /^\d{4}$/.test(r.soc) && getOccupation(r.soc) ? r.soc : null;
    out.set(r.id, { socCode: soc, field: isFieldKey(r.field) ? r.field : null });
  }
  return out;
}

export class ClassifierUnavailableError extends Error {}

export function createJobClassifier(options: { apiKey?: string } = {}) {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const usage = { requests: 0, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };

  async function classify(batch: ClassifyInput[]): Promise<Map<string, Classification>> {
    const jobs = batch.map((j, id) => ({
      id,
      title: j.title,
      employer: j.employer,
      employer_industry: j.employerIndustry ?? "unknown",
      ad: (j.description ?? "").replace(/\s+/g, " ").slice(0, AD_CHARS),
    }));
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: CLASSIFY_MODEL,
        max_tokens: 6000,
        // Medium effort: on a 100-job trial, low effort let long ads pull clear titles to the wrong code.
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
        system: [
          { type: "text", text: INSTRUCTIONS },
          // The occupation list is identical on every request, so it's cached after the first.
          { type: "text", text: OCCUPATION_LIST, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: JSON.stringify(jobs) }],
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new ClassifierUnavailableError("Anthropic API key rejected");
      }
      if (error instanceof Anthropic.APIError && error.status === 402) {
        throw new ClassifierUnavailableError("Anthropic credit exhausted or spend limit reached");
      }
      // Rate limits and transient errors: these jobs keep their rules-based result for now.
      return new Map();
    }
    usage.requests++;
    usage.inputTokens += response.usage.input_tokens;
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;
    usage.outputTokens += response.usage.output_tokens;
    if (response.stop_reason === "refusal") return new Map();

    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    const parsed = parseClassifications(text, batch.length);
    return new Map([...parsed].map(([id, c]) => [batch[id].key, c]));
  }

  /** Claude Haiku 5.5 list prices: $0.10/M input, $0.50/M output; cache reads 0.1x, 5-minute cache writes 1.25x. */
  const costUsd = () =>
    (usage.inputTokens * 0.1 + usage.cacheReadTokens * 0.01 + usage.cacheWriteTokens * 0.125 + usage.outputTokens * 0.5) / 1_000_000;

  return { classify, usage, costUsd };
}
