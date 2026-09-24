import type { Lock, LockAdapter } from "./interface.js";

export class MemoryLockAdapter implements LockAdapter {
  private locks = new Map<string, { expiresAt: number; waiters: Array<(lock: Lock | null) => void> }>();

  async acquire(key: string, ttlMs: number): Promise<Lock | null> {
    const now = Date.now();
    const existing = this.locks.get(key);

    if (existing && existing.expiresAt > now) {
      return new Promise<Lock | null>((resolve) => {
        existing.waiters.push(resolve);
        setTimeout(() => resolve(null), ttlMs);
      });
    }

    const entry = { expiresAt: now + ttlMs, waiters: [] as Array<(lock: Lock | null) => void> };
    this.locks.set(key, entry);

    const release = async () => {
      const current = this.locks.get(key);
      if (current !== entry) return;

      const nextWaiter = current.waiters.shift();
      if (nextWaiter) {
        const newEntry = {
          expiresAt: Date.now() + ttlMs,
          waiters: current.waiters,
        };
        this.locks.set(key, newEntry);
        nextWaiter({
          release: async () => {
            const c = this.locks.get(key);
            if (c === newEntry) this.locks.delete(key);
          },
        });
      } else {
        this.locks.delete(key);
      }
    };

    return { release };
  }
}
