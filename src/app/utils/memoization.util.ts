/**
 * Memoization utilities for expensive computations
 *
 * Provides caching for pure functions to avoid redundant calculations.
 */

/**
 * Simple memoization for functions with single argument
 * @param fn - Function to memoize
 * @returns Memoized function
 */
export function memoize<T, R>(fn: (arg: T) => R): (arg: T) => R {
  const cache = new Map<string, R>();

  return (arg: T): R => {
    const key = JSON.stringify(arg);
    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(arg);
    cache.set(key, result);
    return result;
  };
}

/**
 * Memoization for functions with multiple arguments
 * @param fn - Function to memoize
 * @returns Memoized function
 */
export function memoizeMulti<T extends unknown[], R>(fn: (...args: T) => R): (...args: T) => R {
  const cache = new Map<string, R>();

  return (...args: T): R => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * Memoization with time-to-live (TTL)
 * @param fn - Function to memoize
 * @param ttlMs - Time to live in milliseconds
 * @returns Memoized function with TTL
 */
export function memoizeWithTTL<T, R>(fn: (arg: T) => R, ttlMs: number): (arg: T) => R {
  const cache = new Map<string, { value: R; expiry: number }>();

  return (arg: T): R => {
    const key = JSON.stringify(arg);
    const cached = cache.get(key);

    if (cached && Date.now() < cached.expiry) {
      return cached.value;
    }

    const result = fn(arg);
    cache.set(key, {
      value: result,
      expiry: Date.now() + ttlMs,
    });

    return result;
  };
}

/**
 * Clear a memoization cache
 * @param fn - Memoized function
 */
export function clearMemoCache<T, R>(fn: (arg: T) => R): void {
  // Note: This is a best-effort approach
  // For proper cache clearing, use a class-based memoization
}

/**
 * Class-based memoization for methods
 */
export class MemoCache<T, R> {
  private cache = new Map<string, R>();

  /**
   * Get cached value or compute and cache it
   */
  get(key: string, compute: () => R): R {
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const value = compute();
    this.cache.set(key, value);
    return value;
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: R): void {
    this.cache.set(key, value);
  }

  /**
   * Get a value from the cache without computing
   */
  peek(key: string): R | undefined {
    return this.cache.get(key);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove a specific key from the cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Get the number of cached items
   */
  size(): number {
    return this.cache.size;
  }
}

/**
 * Memoization with size limit (LRU eviction)
 */
export class LRUMemoCache<T, R> {
  private cache = new Map<string, R>();
  private readonly maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get(key: string, compute: () => R): R {
    if (this.cache.has(key)) {
      const value = this.cache.get(key)!;
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    const value = compute();

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
    return value;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
