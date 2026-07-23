import { describe, expect, it } from "vitest";
import { TtlCache } from "../src/lib/ttl-cache";

describe("TtlCache", () => {
  it("returns undefined for cache misses", () => {
    const cache = new TtlCache<string, string>({ ttlMs: 1000 });

    expect(cache.get("missing")).toBeUndefined();
  });

  it("reuses cached values before TTL expires", () => {
    let now = 100;
    const cache = new TtlCache<string, string>({ ttlMs: 1000, now: () => now });

    cache.set("key", "value");
    now = 1099;

    expect(cache.get("key")).toBe("value");
  });

  it("expires cached values at TTL boundary", () => {
    let now = 100;
    const cache = new TtlCache<string, string>({ ttlMs: 1000, now: () => now });

    cache.set("key", "value");
    now = 1100;

    expect(cache.get("key")).toBeUndefined();
    expect(cache.get("key")).toBeUndefined();
  });
});
