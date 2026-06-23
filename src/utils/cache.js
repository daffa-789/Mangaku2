/**
 * Simple in-memory cache utility
 * Supports TTL (Time To Live) and cache invalidation
 */

class CacheEntry {
  constructor(value, ttlMs) {
    this.value = value;
    this.expiresAt = ttlMs ? Date.now() + ttlMs : null;
  }

  isExpired() {
    if (!this.expiresAt) return false;
    return Date.now() > this.expiresAt;
  }
}

class SimpleCache {
  constructor() {
    this.store = new Map();
    this.timers = new Map();
  }

  set(key, value, ttlMs = null) {
    // Clear existing timer if any
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }

    const entry = new CacheEntry(value, ttlMs);
    this.store.set(key, entry);

    // Schedule cleanup for expired entries
    if (ttlMs) {
      const timer = setTimeout(() => {
        this.delete(key);
      }, ttlMs);
      this.timers.set(key, timer);
    }

    return this;
  }

  get(key) {
    const entry = this.store.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.isExpired()) {
      this.delete(key);
      return undefined;
    }

    return entry.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }

    return this.store.delete(key);
  }

  clear() {
    // Clear all timers
    this.timers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.timers.clear();

    // Clear store
    this.store.clear();
  }

  invalidatePattern(pattern) {
    const regex = new RegExp(pattern);
    const keysToDelete = [];

    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => {
      this.delete(key);
    });

    return keysToDelete.length;
  }

  size() {
    return this.store.size;
  }
}

// Export singleton instance
export const cache = new SimpleCache();

// Export class for testing purposes
export { SimpleCache, CacheEntry };
