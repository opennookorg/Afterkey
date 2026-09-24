import type { ProviderAdapter } from "./provider/factory.js";
import type { StorageAdapter } from "./storage/interface.js";
import type { LockAdapter } from "./locking/interface.js";
import { CredentialVault } from "./credential/vault.js";
import { RefreshEngine } from "./credential/refresh-engine.js";
import { OAuthHandler } from "./oauth/handler.js";
import { EventEmitter } from "./events/emitter.js";
import { MemoryStorageAdapter } from "./storage/memory.js";
import { MemoryLockAdapter } from "./locking/memory.js";
import type {
  ConnectOptions,
  ConnectResult,
  Connection,
  FetchOptions,
  RequireResult,
} from "./types.js";

export interface AfterkeyConfig {
  providers: ProviderAdapter[];
  storage?: StorageAdapter;
  lock?: LockAdapter;
  encryptionKey: string;
  redirectUri?: string;
}

export class Afterkey {
  private readonly providerMap: Map<string, ProviderAdapter>;
  private readonly storage: StorageAdapter;
  private readonly vault: CredentialVault;
  private readonly refreshEngine: RefreshEngine;
  private readonly oauthHandler: OAuthHandler;
  readonly events: EventEmitter;

  constructor(config: AfterkeyConfig) {
    this.providerMap = new Map(config.providers.map((p) => [p.id, p]));
    this.storage = config.storage ?? new MemoryStorageAdapter();
    this.vault = new CredentialVault({ encryptionKey: config.encryptionKey });
    const lock = config.lock ?? new MemoryLockAdapter();

    this.events = new EventEmitter();
    this.refreshEngine = new RefreshEngine(this.providerMap, this.storage, this.vault, lock);
    this.oauthHandler = new OAuthHandler(
      this.providerMap,
      this.storage,
      this.vault,
      config.redirectUri ?? "http://localhost:3000/callback"
    );
  }

  async connect(options: ConnectOptions): Promise<ConnectResult> {
    return this.oauthHandler.connect(options);
  }

  async handleCallback(state: string, code: string): Promise<Connection> {
    return this.oauthHandler.handleCallback(state, code);
  }

  async reconnect(connectionId: string): Promise<ConnectResult> {
    return this.oauthHandler.reconnect(connectionId);
  }

  async fetch(options: FetchOptions): Promise<Response> {
    const connection = await this.storage.connections.get(options.connectionId);
    if (!connection) throw new Error(`Connection ${options.connectionId} not found`);

    if (connection.status === "REAUTH_REQUIRED" || connection.status === "REVOKED") {
      throw new Error(`Connection ${connection.id} is ${connection.status}`);
    }

    const accessToken = await this.refreshEngine.getValidAccessToken(connection);
    await this.storage.connections.touch(connection.id);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    };

    const res = await globalThis.fetch(options.url, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 401) {
      const adapter = this.providerMap.get(connection.provider);
      if (adapter) {
        const body = await res.clone().json().catch(() => null);
        const normalized = adapter.normalizeError(res.status, body);
        if (normalized.permanent) {
          await this.storage.connections.updateStatus(connection.id, "REAUTH_REQUIRED");
          await this.storage.events.create(connection.id, "connection.reauth_required", normalized.reason);
          this.events.emit(connection.id, "connection.reauth_required", normalized.reason);
        }
      }
    }

    return res;
  }

  async require(connectionId: string, scopes: string[]): Promise<RequireResult> {
    const connection = await this.storage.connections.get(connectionId);
    if (!connection) throw new Error(`Connection ${connectionId} not found`);

    const missing = scopes.filter((s) => !connection.grantedScopes.includes(s));
    if (missing.length === 0) {
      return { ready: true, status: connection.status };
    }

    const adapter = this.providerMap.get(connection.provider);
    if (!adapter) throw new Error(`Unknown provider: ${connection.provider}`);

    const allScopes = [...new Set([...connection.grantedScopes, ...missing])];
    const { authorizationUrl } = await this.oauthHandler.reconnect(connectionId);

    return {
      ready: false,
      status: "SCOPE_REQUIRED",
      missingScopes: missing,
      authorizationUrl,
    };
  }

  get connections() {
    return {
      get: (id: string) => this.storage.connections.get(id),
      list: (userId: string, provider?: string, tenantId = "default") =>
        this.storage.connections.list(tenantId, userId, provider),
      events: (connectionId: string, limit?: number) =>
        this.storage.events.list(connectionId, limit),
    };
  }
}
