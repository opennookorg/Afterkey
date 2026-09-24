import { randomUUID } from "crypto";
import type {
  Connection,
  ConnectionStatus,
  Credential,
  LifecycleEvent,
  LifecycleEventType,
  OAuthState,
  RefreshOperation,
} from "../types.js";
import type { StorageAdapter } from "./interface.js";

export class MemoryStorageAdapter implements StorageAdapter {
  private _connections = new Map<string, Connection>();
  private _credentials = new Map<string, Credential>();
  private _oauthStates = new Map<string, OAuthState>();
  private _events: LifecycleEvent[] = [];
  private _refreshOps = new Map<string, RefreshOperation>();

  connections = {
    create: async (data: Omit<Connection, "id" | "createdAt" | "updatedAt">): Promise<Connection> => {
      const conn: Connection = {
        ...data,
        id: `conn_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this._connections.set(conn.id, conn);
      return conn;
    },

    get: async (id: string) => this._connections.get(id) ?? null,

    getByProviderAccount: async (
      tenantId: string,
      userId: string,
      provider: string,
      providerAccountId: string
    ) => {
      for (const conn of this._connections.values()) {
        if (
          conn.tenantId === tenantId &&
          conn.userId === userId &&
          conn.provider === provider &&
          conn.providerAccountId === providerAccountId
        )
          return conn;
      }
      return null;
    },

    list: async (tenantId: string, userId: string, provider?: string) => {
      return [...this._connections.values()].filter(
        (c) =>
          c.tenantId === tenantId &&
          c.userId === userId &&
          (!provider || c.provider === provider)
      );
    },

    updateStatus: async (id: string, status: ConnectionStatus, credentialVersion?: number) => {
      const conn = this._connections.get(id);
      if (!conn) throw new Error(`Connection ${id} not found`);
      conn.status = status;
      conn.updatedAt = new Date();
      if (credentialVersion !== undefined) conn.credentialVersion = credentialVersion;
      return conn;
    },

    updateScopes: async (id: string, scopes: string[]) => {
      const conn = this._connections.get(id);
      if (!conn) throw new Error(`Connection ${id} not found`);
      conn.grantedScopes = scopes;
      conn.updatedAt = new Date();
      return conn;
    },

    touch: async (id: string) => {
      const conn = this._connections.get(id);
      if (conn) conn.lastUsedAt = new Date();
    },
  };

  credentials = {
    save: async (data: Omit<Credential, "createdAt">): Promise<Credential> => {
      const cred: Credential = { ...data, createdAt: new Date() };
      this._credentials.set(data.connectionId, cred);
      return cred;
    },

    get: async (connectionId: string) => this._credentials.get(connectionId) ?? null,

    getByVersion: async (connectionId: string, version: number) => {
      const cred = this._credentials.get(connectionId);
      if (cred && cred.version === version) return cred;
      return null;
    },
  };

  oauthState = {
    save: async (state: OAuthState) => {
      this._oauthStates.set(state.sessionId, state);
    },
    get: async (sessionId: string) => this._oauthStates.get(sessionId) ?? null,
    delete: async (sessionId: string) => {
      this._oauthStates.delete(sessionId);
    },
  };

  events = {
    create: async (
      connectionId: string,
      type: LifecycleEventType,
      reason?: string,
      providerErrorCode?: string,
      metadata?: Record<string, unknown>
    ): Promise<LifecycleEvent> => {
      const event: LifecycleEvent = {
        id: `evt_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
        connectionId,
        type,
        reason: reason ?? null,
        providerErrorCode: providerErrorCode ?? null,
        metadata: metadata ?? {},
        createdAt: new Date(),
      };
      this._events.push(event);
      return event;
    },

    list: async (connectionId: string, limit = 50) => {
      return this._events
        .filter((e) => e.connectionId === connectionId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
  };

  refreshOperations = {
    create: async (op: Omit<RefreshOperation, "id" | "startedAt">): Promise<RefreshOperation> => {
      const refreshOp: RefreshOperation = {
        ...op,
        id: `ref_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
        startedAt: new Date(),
      };
      this._refreshOps.set(refreshOp.id, refreshOp);
      return refreshOp;
    },

    complete: async (
      id: string,
      status: "success" | "failure",
      credentialVersionAfter?: number,
      failureReason?: string
    ) => {
      const op = this._refreshOps.get(id);
      if (!op) return;
      op.status = status;
      op.completedAt = new Date();
      op.credentialVersionAfter = credentialVersionAfter ?? null;
      op.failureReason = failureReason ?? null;
    },
  };

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}
