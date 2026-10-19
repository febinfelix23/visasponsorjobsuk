import type { SponsorRecord } from "./register";

export type ExistingSponsor = {
  id: number;
  registerKey: string;
  status: "active" | "removed";
  name: string;
  county: string | null;
  workerRating: string | null;
  temporaryWorkerRating: string | null;
  routes: string[];
};

export type SponsorEventDraft = {
  registerKey: string;
  type: "added" | "removed" | "readded" | "rating_changed" | "routes_changed";
  details?: Record<string, unknown>;
};

export type RegisterDiff = {
  /** New, re-added or changed sponsors to write. */
  upserts: SponsorRecord[];
  /** Active sponsors missing from the new register. */
  removed: ExistingSponsor[];
  events: SponsorEventDraft[];
  addedCount: number;
  changedCount: number;
};

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function diffRegister(existing: ExistingSponsor[], incoming: Map<string, SponsorRecord>): RegisterDiff {
  const byKey = new Map(existing.map((s) => [s.registerKey, s]));
  const diff: RegisterDiff = { upserts: [], removed: [], events: [], addedCount: 0, changedCount: 0 };

  for (const record of incoming.values()) {
    const prev = byKey.get(record.registerKey);
    if (!prev) {
      diff.upserts.push(record);
      diff.events.push({ registerKey: record.registerKey, type: "added" });
      diff.addedCount++;
      continue;
    }
    if (prev.status === "removed") {
      diff.upserts.push(record);
      diff.events.push({ registerKey: record.registerKey, type: "readded" });
      diff.addedCount++;
      continue;
    }

    const ratingChanged =
      prev.workerRating !== record.workerRating || prev.temporaryWorkerRating !== record.temporaryWorkerRating;
    const prevRoutes = [...prev.routes].sort();
    const routesChanged = !sameList(prevRoutes, record.routes);
    const otherChanged = prev.name !== record.name || prev.county !== record.county;

    if (ratingChanged) {
      diff.events.push({
        registerKey: record.registerKey,
        type: "rating_changed",
        details: {
          from: { worker: prev.workerRating, temporaryWorker: prev.temporaryWorkerRating },
          to: { worker: record.workerRating, temporaryWorker: record.temporaryWorkerRating },
        },
      });
    }
    if (routesChanged) {
      diff.events.push({
        registerKey: record.registerKey,
        type: "routes_changed",
        details: {
          added: record.routes.filter((r) => !prevRoutes.includes(r)),
          removed: prevRoutes.filter((r) => !record.routes.includes(r)),
        },
      });
    }
    if (ratingChanged || routesChanged || otherChanged) {
      diff.upserts.push(record);
      diff.changedCount++;
    }
  }

  for (const prev of existing) {
    if (prev.status === "active" && !incoming.has(prev.registerKey)) {
      diff.removed.push(prev);
      diff.events.push({ registerKey: prev.registerKey, type: "removed" });
    }
  }

  return diff;
}
