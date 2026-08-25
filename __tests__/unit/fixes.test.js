const { parseCacheInit } = require("../../index");

describe("Index.js fixes", () => {
  it("should keep options instance-scoped for multiple caches", () => {
    const a = parseCacheInit({ maxClassCaches: 1 });
    const b = parseCacheInit({ maxClassCaches: 5 });

    expect(a.options.maxClassCaches).toBe(1);
    expect(b.options.maxClassCaches).toBe(5);
  });

  it("should respect maxClassCaches and evict oldest class when exceeded", () => {
    const cache = parseCacheInit({ maxClassCaches: 1 });
    cache.resetEverything();

    cache.set("A", "k1", 1);
    expect(cache.classCount).toBe(1);
    expect(cache.cache.has("A")).toBe(true);

    cache.set("B", "k2", 2);
    // should still be 1 and B should exist while A evicted
    expect(cache.classCount).toBe(1);
    expect(cache.cache.has("B")).toBe(true);
    expect(cache.cache.has("A")).toBe(false);
  });

  it('should treat falsy cached values (0, false, "") as cache hits', async () => {
    const cache = parseCacheInit();
    cache.resetEverything();

    cache.set("A", "zero", 0);
    cache.set("A", "empty", "");
    cache.set("A", "boolfalse", false);

    const mockQuery = { className: "A", toJSON: () => ({}) };

    const v0 = await cache.get(mockQuery, "zero");
    const vEmpty = await cache.get(mockQuery, "empty");
    const vFalse = await cache.get(mockQuery, "boolfalse");

    expect(v0).toBe(0);
    expect(vEmpty).toBe("");
    expect(vFalse).toBe(false);
  });
});
