import type {
  Connection,
  ConnectionStatus,
  Credential,
  LifecycleEvent,
  LifecycleEventType,
  OAuthState,
  RefreshOperation,
} from "../types.js";

export interface StorageAdapter {
  connections: {
    create(connection: Omit<Connection, "id" | "createdAt" | "updatedAt">): Promise<Connection>;
    get(id: string): Promise<Connection | null>;
    getByProviderAccount(
      tenantId: string,
      userId: string,
      provider: string,
      providerAccountId: string
    ): Promise<Connection | null>;
    list(tenantId: string, userId: string, provider?: string): Promise<Connection[]>;
    updateStatus(id: string, status: ConnectionStatus, credentialVersion?: number): Promise<Connection>;
    updateScopes(id: string, scopes: string[]): Promise<Connection>;
    touch(id: string): Promise<void>;
  };

  credentials: {
    save(credential: Omit<Credential, "createdAt">): Promise<Credential>;
    get(connectionId: string): Promise<Credential | null>;
    getByVersion(connectionId: string, version: number): Promise<Credential | null>;
  };

  oauthState: {
    save(state: OAuthState): Promise<void>;
    get(sessionId: string): Promise<OAuthState | null>;
    delete(sessionId: string): Promise<void>;
  };

  events: {
    create(
      connectionId: string,
      type: LifecycleEventType,
      reason?: string,
      providerErrorCode?: string,
      metadata?: Record<string, unknown>
    ): Promise<LifecycleEvent>;
    list(connectionId: string, limit?: number): Promise<LifecycleEvent[]>;
  };

  refreshOperations: {
    create(op: Omit<RefreshOperation, "id" | "startedAt">): Promise<RefreshOperation>;
    complete(id: string, status: "success" | "failure", credentialVersionAfter?: number, failureReason?: string): Promise<void>;
  };

  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
