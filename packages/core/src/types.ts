export type ConnectionStatus =
  | "HEALTHY"
  | "REFRESHING"
  | "DEGRADED"
  | "REAUTH_REQUIRED"
  | "REVOKED";

export interface Connection {
  id: string;
  tenantId: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  providerWorkspaceId: string | null;
  displayName: string;
  status: ConnectionStatus;
  grantedScopes: string[];
  credentialVersion: number;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  lastSuccessfulRefreshAt: Date | null;
  lastRefreshFailureAt: Date | null;
}

export interface Credential {
  connectionId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  expiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  tokenType: string;
  metadata: Record<string, unknown>;
  version: number;
  createdAt: Date;
}

export type LifecycleEventType =
  | "connection.created"
  | "connection.refresh_started"
  | "connection.refreshed"
  | "connection.degraded"
  | "connection.reauth_required"
  | "connection.restored"
  | "connection.revoked"
  | "connection.scope_upgraded";

export interface LifecycleEvent {
  id: string;
  connectionId: string;
  type: LifecycleEventType;
  reason: string | null;
  providerErrorCode: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface RefreshOperation {
  id: string;
  connectionId: string;
  credentialVersionBefore: number;
  credentialVersionAfter: number | null;
  status: "pending" | "success" | "failure";
  startedAt: Date;
  completedAt: Date | null;
  failureReason: string | null;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  tokenType: string;
  scope: string | null;
  rawResponse: Record<string, unknown>;
}

export interface AccountInfo {
  id: string;
  email: string | null;
  displayName: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
}

export interface NormalizedError {
  permanent: boolean;
  reason: string;
  providerCode: string | null;
  retryable: boolean;
}

export interface OAuthState {
  sessionId: string;
  provider: string;
  userId: string;
  tenantId: string;
  scopes: string[];
  codeVerifier: string | null;
  redirectUri: string;
  existingConnectionId: string | null;
  createdAt: Date;
}

export interface ConnectOptions {
  userId: string;
  provider: string;
  scopes?: string[];
  redirectUri?: string;
  tenantId?: string;
}

export interface ConnectResult {
  authorizationUrl: string;
  sessionId: string;
}

export interface FetchOptions {
  connectionId: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface RequireResult {
  ready: boolean;
  status: ConnectionStatus | "SCOPE_REQUIRED";
  missingScopes?: string[];
  authorizationUrl?: string;
}
