/**
 * Short links for posts: /j/<code>, where the code is the job's ID in base 36 ("cc8" for
 * 15992). IDs never repeat, so a code can only ever open one job, unlike the 6-character
 * hash at the end of a slug, which a few of ~12,000 jobs are likely to share.
 */
export const shortJobPath = (jobId: number) => `/j/${jobId.toString(36)}`;

export function jobIdFromCode(code: string): number | null {
  if (!/^[0-9a-z]{1,10}$/.test(code)) return null;
  const id = parseInt(code, 36);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
