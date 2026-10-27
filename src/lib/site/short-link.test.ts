import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jobIdFromCode, shortJobPath } from "./short-link";

describe("short job links", () => {
  it("writes the job ID in base 36 and reads it back", () => {
    assert.equal(shortJobPath(15992), "/j/cc8");
    for (const id of [1, 35, 36, 15992, 2_000_000]) assert.equal(jobIdFromCode(shortJobPath(id).slice(3)), id);
  });

  it("refuses codes that aren't a job ID", () => {
    for (const bad of ["", "0", "CC8", "cc-8", "../admin", "zzzzzzzzzzz"]) assert.equal(jobIdFromCode(bad), null, bad);
  });
});
