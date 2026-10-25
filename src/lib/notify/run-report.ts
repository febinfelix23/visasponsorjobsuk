import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Steps of one GitHub Actions job hand their summaries to the final notify step through
 * files in RUN_REPORT_DIR (each step's GITHUB_STEP_SUMMARY is its own, so it can't be read back).
 */
export async function saveReport(name: string, data: unknown): Promise<void> {
  const dir = process.env.RUN_REPORT_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.json`), JSON.stringify(data));
}

export async function loadReport<T>(name: string): Promise<T | null> {
  const dir = process.env.RUN_REPORT_DIR;
  if (!dir) return null;
  try {
    return JSON.parse(await readFile(join(dir, `${name}.json`), "utf8")) as T;
  } catch {
    return null;
  }
}
