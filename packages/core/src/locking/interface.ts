export interface LockAdapter {
  acquire(key: string, ttlMs: number): Promise<Lock | null>;
}

export interface Lock {
  release(): Promise<void>;
}
