type Clock = () => number;

type TtlCacheOptions = {
  ttlMs: number;
  now?: Clock;
};

type CacheEntry<V> = {
  value: V;
  expiresAt: number;
};

export class TtlCache<K, V> {
  private readonly ttlMs: number;
  private readonly now: Clock;
  private readonly entries = new Map<K, CacheEntry<V>>();

  constructor(options: TtlCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.now = options.now || Date.now;
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: K, value: V): void {
    this.entries.set(key, {
      value,
      expiresAt: this.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.entries.clear();
  }
}
