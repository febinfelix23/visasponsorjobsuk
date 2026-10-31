/**
 * Measures the AI reader against hand-labelled ads (data/eval/reading-labels.json): reads each
 * labelled ad afresh (billed, about $0.12 for 150; nothing is stored) and checks the accuracy
 * gate from the design before the reader's facts decide stamps.
 *
 *   npm run eval:reader
 */
import "./load-env";

import { readFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { createDb } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { evaluateReadings, passesGate, type EvalLabel, type EvalResult } from "@/lib/reading/eval";
import { createJobReader } from "@/lib/reading/read-job";
import { sponsorshipSignal } from "@/lib/scoring/signals";

const CONCURRENCY = 3;
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");

async function main() {
  const reader = createJobReader();
  if (!reader) throw new Error("ANTHROPIC_API_KEY is not set");
  const { labels } = JSON.parse(readFileSync("data/eval/reading-labels.json", "utf8")) as { labels: EvalLabel[] };
  const db = createDb(undefined, { max: 2 });
  try {
    const rows = await db
      .select({ id: jobs.id, title: jobs.title, employer: jobs.employerName, employmentType: jobs.employmentType, salaryText: jobs.salaryText, closingDate: jobs.closingDate, description: jobs.description })
      .from(jobs)
      .where(inArray(jobs.id, labels.map((l) => l.id)));
    const results: (EvalResult & { quotes: string[] })[] = [];
    const queue = [...rows];
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const { reading } = await reader.read(job);
        if (!reading) continue;
        const rulesSayNo = sponsorshipSignal(`${job.title}\n${job.salaryText ?? ""}\n${job.description ?? ""}`).negative !== null;
        results.push({ id: job.id, reading, rulesSayNo, quotes: reading.sponsorship.quotes });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const m = evaluateReadings(labels, results);
    const titles = new Map(rows.map((r) => [r.id, r.title]));
    const show = (ids: number[]) => ids.map((id) => `  #${id} ${titles.get(id)?.slice(0, 60)}`).join("\n") || "  none";
    console.log(`Read ${results.length} of ${labels.length} labelled ads ($${reader.costUsd().toFixed(3)})`);
    console.log(`"No sponsorship" caught: ${m.noCaught}/${m.noTotal} (${pct(m.noCaught, m.noTotal)}); by the reader alone ${m.noCaughtByReader}`);
    console.log(`Missed:\n${show(m.noMissed)}`);
    console.log(`Read as "no" but labelled otherwise:\n${show(m.falseNo)}`);
    console.log(`Contract right: ${m.contractRight}/${m.contractTotal} (${pct(m.contractRight, m.contractTotal)})\n${show(m.contractWrong)}`);
    console.log(`"No" or conditional ads read as an offer:\n${show(m.falseOffer)}`);
    console.log(`Based abroad caught: ${m.abroadCaught}/${m.abroadTotal}; UK jobs read as abroad:\n${show(m.falseAbroad)}`);
    console.log(`Hours right: ${m.hoursRight}/${m.hoursTotal} (${pct(m.hoursRight, m.hoursTotal)})\n${show(m.hoursWrong)}`);
    console.log(passesGate(m) ? "\nGATE PASSED" : "\nGATE NOT PASSED");
  } finally {
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
