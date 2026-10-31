import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeFilterCount, parseFilters, searchHref } from "./search";

describe("parseFilters", () => {
  it("reads every filter and falls back to the defaults", () => {
    assert.deepEqual(parseFilters({}), { q: undefined, location: undefined, field: undefined, show: "passes", includeSenior: false, gradSchemes: false, entryLevel: false, sort: "best", page: 1 });
    const f = parseFilters({ q: " data ", location: "Leeds", field: "data", show: "all", senior: "1", grad: "1", entry: "1", sort: "salary", page: "3" });
    assert.deepEqual(f, { q: "data", location: "Leeds", field: "data", show: "all", includeSenior: true, gradSchemes: true, entryLevel: true, sort: "salary", page: 3 });
  });

  it("ignores values it doesn't know", () => {
    const f = parseFilters({ field: "astrology", sort: "random", page: "-2" });
    assert.equal(f.field, undefined);
    assert.equal(f.sort, "best");
    assert.equal(f.page, 1);
  });

  it("keeps the old sector links working", () => {
    assert.equal(parseFilters({ sector: "tech" }).field, "software");
  });
});

describe("searchHref", () => {
  it("leaves defaults out of the address", () => {
    assert.equal(searchHref(parseFilters({})), "/");
    assert.equal(searchHref(parseFilters({ location: "Leeds", sort: "newest" })), "/?location=Leeds&sort=newest");
  });

  it("round-trips through parseFilters", () => {
    const f = parseFilters({ q: "nurse", field: "healthcare", grad: "1", entry: "1", sort: "salary", page: "2" });
    assert.deepEqual(parseFilters(Object.fromEntries(new URLSearchParams(searchHref(f).slice(2)))), f);
  });

  it("keeps a post's UTM tags in front", () => {
    assert.equal(searchHref(parseFilters({ field: "data" }), 1, "utm_source=telegram"), "/?utm_source=telegram&field=data");
  });
});

describe("activeFilterCount", () => {
  it("counts the panel's filters that aren't defaults", () => {
    assert.equal(activeFilterCount(parseFilters({})), 0);
    assert.equal(activeFilterCount(parseFilters({ field: "data", grad: "1", q: "ignored", sort: "newest" })), 2);
    assert.equal(activeFilterCount(parseFilters({ entry: "1" })), 1);
  });
});
