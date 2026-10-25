import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JwtPayload } from "@supabase/supabase-js";
import { isAdminClaims, safeNext } from "./rules";

const claims = (extra: Partial<JwtPayload>) => ({ sub: "u", role: "authenticated", ...extra }) as JwtPayload;

describe("isAdminClaims", () => {
  it("accepts only app_metadata.role = admin", () => {
    assert.equal(isAdminClaims(claims({ app_metadata: { role: "admin" } })), true);
    assert.equal(isAdminClaims(claims({ app_metadata: { provider: "google" } })), false);
    assert.equal(isAdminClaims(claims({})), false);
    assert.equal(isAdminClaims(null), false);
    assert.equal(isAdminClaims(undefined), false);
  });

  it("ignores user_metadata, which users can edit themselves", () => {
    assert.equal(isAdminClaims(claims({ user_metadata: { role: "admin" } })), false);
  });

  it("ignores the JWT's own role claim", () => {
    assert.equal(isAdminClaims(claims({ role: "admin" })), false);
  });
});

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    assert.equal(safeNext("/admin"), "/admin");
    assert.equal(safeNext("/admin?days=7"), "/admin?days=7");
  });

  it("falls back for other sites and junk", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example/admin", "evil.example", "javascript:alert(1)", "", null, undefined]) {
      assert.equal(safeNext(bad), "/admin", String(bad));
    }
  });

  it("uses the given fallback", () => {
    assert.equal(safeNext(null, "/"), "/");
  });
});
