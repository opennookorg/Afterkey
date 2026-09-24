import type { ProviderAdapter } from "../provider/factory.js";
import { ProviderError } from "../provider/factory.js";
import type { StorageAdapter } from "../storage/interface.js";
import type { LockAdapter } from "../locking/interface.js";
import { CredentialVault } from "./vault.js";
import { transition, classifyRefreshError } from "../connection/state-machine.js";
import type { Connection, Credential } from "../types.js";

const REFRESH_LOCK_TTL_MS = 30_000;
const EXPIRY_BUFFER_MS = 60_000;

export class RefreshEngine {
  constructor(
    private readonly providers: Map<string, ProviderAdapter>,
    private readonly storage: StorageAdapter,
    private readonly vault: CredentialVault,
    private readonly locks: LockAdapter
  ) {}

  async getValidAccessToken(connection: Connection): Promise<string> {
    const credential = await this.storage.credentials.get(connection.id);
    if (!credential) throw new Error(`No credential for connection ${connection.id}`);

    if (!this.isExpired(credential)) {
      return this.vault.decrypt(credential.encryptedAccessToken);
    }

    const refreshed = await this.refreshWithLock(connection, credential);
    return this.vault.decrypt(refreshed.encryptedAccessToken);
  }

  private isExpired(credential: Credential): boolean {
    if (!credential.expiresAt) return false;
    return credential.expiresAt.getTime() - EXPIRY_BUFFER_MS <= Date.now();
  }

  private async refreshWithLock(connection: Connection, credential: Credential): Promise<Credential> {
    const lockKey = `refresh:${connection.id}`;
    const lock = await this.locks.acquire(lockKey, REFRESH_LOCK_TTL_MS);

    if (!lock) {
      return this.waitForRefresh(connection);
    }

    try {
      const freshCred = await this.storage.credentials.get(connection.id);
      if (freshCred && freshCred.version > credential.version && !this.isExpired(freshCred)) {
        return freshCred;
      }

      return await this.executeRefresh(connection, freshCred ?? credential);
    } finally {
      await lock.release();
    }
  }

  private async waitForRefresh(connection: Connection): Promise<Credential> {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const cred = await this.storage.credentials.get(connection.id);
      if (cred && !this.isExpired(cred)) return cred;
    }
    throw new Error(`Refresh timeout for connection ${connection.id}`);
  }

  private async executeRefresh(connection: Connection, credential: Credential): Promise<Credential> {
    const adapter = this.providers.get(connection.provider);
    if (!adapter) throw new Error(`Unknown provider: ${connection.provider}`);

    if (!credential.encryptedRefreshToken) {
      await this.transitionAndEmit(connection, "refresh_failed_permanent", "no_refresh_token");
      throw new Error("No refresh token available");
    }

    const refreshToken = this.vault.decrypt(credential.encryptedRefreshToken);
    const refreshOp = await this.storage.refreshOperations.create({
      connectionId: connection.id,
      credentialVersionBefore: credential.version,
      credentialVersionAfter: null,
      status: "pending",
      completedAt: null,
      failureReason: null,
    });

    await this.storage.events.create(connection.id, "connection.refresh_started");
    const newStatus = transition(connection.status, "refresh_started");
    if (newStatus) await this.storage.connections.updateStatus(connection.id, newStatus);

    try {
      const tokens = await adapter.refresh(refreshToken);
      const newVersion = credential.version + 1;

      const newCredential = await this.storage.transaction(async () => {
        const current = await this.storage.credentials.get(connection.id);
        if (current && current.version !== credential.version) {
          throw new Error("Stale credential version, another refresh succeeded");
        }

        const saved = await this.storage.credentials.save({
          connectionId: connection.id,
          encryptedAccessToken: this.vault.encrypt(tokens.accessToken),
          encryptedRefreshToken: tokens.refreshToken
            ? this.vault.encrypt(tokens.refreshToken)
            : credential.encryptedRefreshToken,
          expiresAt: tokens.expiresAt,
          refreshTokenExpiresAt: tokens.refreshTokenExpiresAt ?? credential.refreshTokenExpiresAt,
          tokenType: tokens.tokenType,
          metadata: {},
          version: newVersion,
        });

        await this.storage.connections.updateStatus(connection.id, "HEALTHY", newVersion);
        return saved;
      });

      await this.storage.refreshOperations.complete(refreshOp.id, "success", newVersion);
      await this.storage.events.create(connection.id, "connection.refreshed");

      return newCredential;
    } catch (error) {
      let reason = "unknown";
      let event = "refresh_failed_permanent";

      if (error instanceof ProviderError) {
        const normalized = adapter.normalizeError(0, error.details);
        reason = normalized.reason;
        event = classifyRefreshError(normalized);
      }

      await this.storage.refreshOperations.complete(refreshOp.id, "failure", undefined, reason);
      await this.transitionAndEmit(connection, event, reason);
      throw error;
    }
  }

  private async transitionAndEmit(connection: Connection, event: string, reason: string) {
    const newStatus = transition(connection.status, event);
    if (newStatus) {
      await this.storage.connections.updateStatus(connection.id, newStatus);
      const eventType =
        newStatus === "REAUTH_REQUIRED"
          ? "connection.reauth_required"
          : newStatus === "DEGRADED"
            ? "connection.degraded"
            : "connection.revoked";
      await this.storage.events.create(connection.id, eventType, reason);
    }
  }
}
