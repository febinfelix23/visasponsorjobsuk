import Anthropic from "@anthropic-ai/sdk";

/**
 * AI check for job boards the text rules can't settle: does this board belong to
 * this licensed sponsor, or to a namesake (Spire Global vs Spire Healthcare)?
 * Used only for the "needs review" queue, a few hundred boards in total.
 */

export const REVIEW_MODEL = "claude-opus-5-5";
/** Hard cap per run, whatever the queue size: worst case about $2 at ~$0.01 a board. */
export const DEFAULT_MAX_REVIEWS_PER_RUN = 200;

export type BoardReviewInput = {
  sponsor: {
    name: string;
    tradingName: string | null;
    town: string;
    county: string | null;
    sector: string | null;
    sicCodes: string[] | null;
  };
  board: {
    ats: string;
    identifier: string;
    boardName: string | null;
    about: string;
    sampleTitles: string[];
    sampleLocations: string[];
  };
};

export type BoardVerdict = "same" | "different" | "unsure";
export type BoardReview = { verdict: BoardVerdict; reason: string; model: string };

const SYSTEM = `You check whether a company's online job board belongs to a specific employer on the UK government's Register of Licensed Sponsors.

Different companies often share a name: "Spire" on a job board may be Spire Global (satellites), not Spire Healthcare (private hospitals). Compare what the board says the company does, and where it hires, with what the sponsor is (its industry codes, sector and town).

Answer:
- "same" when the board's company is clearly the sponsor, or the sponsor is its UK entity (a "UK Limited" or "Europe Ltd" subsidiary of the same brand counts as the same).
- "different" when the board's business clearly doesn't match the sponsor's: different industry, or evidently a different organisation.
- "unsure" when the evidence is too thin or points both ways. Prefer "unsure" over guessing: a wrong "same" puts another company's jobs under this sponsor's name.

Give a one-sentence reason a person could check.`;

const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["same", "different", "unsure"] },
    reason: { type: "string" },
  },
  required: ["verdict", "reason"],
  additionalProperties: false,
} as const;

export function buildReviewPrompt({ sponsor, board }: BoardReviewInput): string {
  const lines = [
    "SPONSOR (licensed employer)",
    `Name: ${sponsor.name}`,
    sponsor.tradingName ? `Trading name: ${sponsor.tradingName}` : null,
    `Town: ${sponsor.town}${sponsor.county ? `, ${sponsor.county}` : ""}`,
    `Sector: ${sponsor.sector ?? "unknown"}`,
    `UK SIC codes: ${sponsor.sicCodes?.join(", ") || "none on file"}`,
    "",
    `JOB BOARD (${board.ats}: ${board.identifier})`,
    board.boardName ? `Board name: ${board.boardName}` : null,
    `How the board describes the company: ${board.about || "(no description)"}`,
    `Sample job titles: ${board.sampleTitles.join("; ") || "(none)"}`,
    `Sample job locations: ${board.sampleLocations.join("; ") || "(none)"}`,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

/** The model's JSON answer, or null when it's malformed (the board then stays in the queue). */
export function parseReviewText(text: string): { verdict: BoardVerdict; reason: string } | null {
  try {
    const parsed = JSON.parse(text) as { verdict?: unknown; reason?: unknown };
    if (parsed.verdict !== "same" && parsed.verdict !== "different" && parsed.verdict !== "unsure") return null;
    return { verdict: parsed.verdict, reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 500) : "" };
  } catch {
    return null;
  }
}

/** Raised when the key is missing or rejected: stop asking for the rest of the run. */
export class ReviewUnavailableError extends Error {}

export function createBoardReviewer(options: { apiKey?: string; maxReviews?: number } = {}) {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const maxReviews = options.maxReviews ?? (Number(process.env.AI_REVIEW_MAX) || DEFAULT_MAX_REVIEWS_PER_RUN);
  let used = 0;
  const usage = { reviews: 0, inputTokens: 0, outputTokens: 0 };

  async function review(input: BoardReviewInput): Promise<BoardReview | null> {
    if (used >= maxReviews) return null;
    used++;
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: REVIEW_MODEL,
        max_tokens: 4000,
        // A short yes/no/unsure judgement: low effort is plenty and keeps cost down.
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        // If a safety classifier declines, re-run on Anthropic's recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        messages: [{ role: "user", content: buildReviewPrompt(input) }],
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new ReviewUnavailableError("Anthropic API key rejected");
      }
      if (error instanceof Anthropic.APIError && error.status === 402) {
        throw new ReviewUnavailableError("Anthropic credit exhausted or spend limit reached");
      }
      // Rate limits and transient errors: leave this board in the queue for next time.
      return null;
    }
    usage.reviews++;
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;

    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
    const parsed = text ? parseReviewText(text) : null;
    return parsed ? { ...parsed, model: response.model } : null;
  }

  return { review, usage };
}

export type BoardReviewer = NonNullable<ReturnType<typeof createBoardReviewer>>;
