import { randomBytes, randomUUID } from "crypto";
import type { ProviderAdapter } from "../provider/factory.js";
import type { StorageAdapter } from "../storage/interface.js";
import { CredentialVault } from "../credential/vault.js";
import type { ConnectOptions, ConnectResult, Connection, TokenSet } from "../types.js";

export class OAuthHandler {
  constructor(
    private readonly providers: Map<string, ProviderAdapter>,
    private readonly storage: StorageAdapter,
    private readonly vault: CredentialVault,
    private readonly defaultRedirectUri: string
  ) {}

  async connect(options: ConnectOptions): Promise<ConnectResult> {
    const adapter = this.providers.get(options.provider);
    if (!adapter) throw new Error(`Unknown provider: ${options.provider}`);

    const sessionId = `session_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const state = randomBytes(32).toString("hex");
    const scopes = options.scopes ?? adapter.definition.scopes.default;
    const redirectUri = options.redirectUri ?? this.defaultRedirectUri;
    const codeVerifier = adapter.definition.authorization.usePKCE
      ? randomBytes(32).toString("base64url")
      : null;

    await this.storage.oauthState.save({
      sessionId,
      provider: options.provider,
      userId: options.userId,
      tenantId: options.tenantId ?? "default",
      scopes,
      codeVerifier,
      redirectUri,
      existingConnectionId: null,
      createdAt: new Date(),
    });

    const authorizationUrl = adapter.authorize(scopes, state, codeVerifier, redirectUri);

    await this.storage.oauthState.save({
      sessionId: state,
      provider: options.provider,
      userId: options.userId,
      tenantId: options.tenantId ?? "default",
      scopes,
      codeVerifier,
      redirectUri,
      existingConnectionId: null,
      createdAt: new Date(),
    });

    return { authorizationUrl, sessionId };
  }

  async handleCallback(state: string, code: string): Promise<Connection> {
    const oauthState = await this.storage.oauthState.get(state);
    if (!oauthState) throw new Error("Invalid or expired OAuth state");

    const adapter = this.providers.get(oauthState.provider);
    if (!adapter) throw new Error(`Unknown provider: ${oauthState.provider}`);

    const tokens = await adapter.exchangeCode(code, oauthState.codeVerifier, oauthState.redirectUri);
    const account = await adapter.identifyAccount(tokens.accessToken);

    const connection = await this.storage.transaction(async () => {
      const existing = await this.storage.connections.getByProviderAccount(
        oauthState.tenantId,
        oauthState.userId,
        oauthState.provider,
        account.id
      );

      if (existing && oauthState.existingConnectionId === existing.id) {
        await this.persistCredentials(existing.id, tokens, existing.credentialVersion + 1);
        const scopes = this.mergeScopes(existing.grantedScopes, oauthState.scopes);
        await this.storage.connections.updateScopes(existing.id, scopes);
        return this.storage.connections.updateStatus(existing.id, "HEALTHY", existing.credentialVersion + 1);
      }

      if (existing) {
        await this.persistCredentials(existing.id, tokens, existing.credentialVersion + 1);
        return this.storage.connections.updateStatus(existing.id, "HEALTHY", existing.credentialVersion + 1);
      }

      const conn = await this.storage.connections.create({
        tenantId: oauthState.tenantId,
        userId: oauthState.userId,
        provider: oauthState.provider,
        providerAccountId: account.id,
        providerWorkspaceId: account.workspaceId,
        displayName: account.displayName ?? account.email ?? account.id,
        status: "HEALTHY",
        grantedScopes: oauthState.scopes,
        credentialVersion: 1,
        lastUsedAt: null,
        lastSuccessfulRefreshAt: null,
        lastRefreshFailureAt: null,
      });

      await this.persistCredentials(conn.id, tokens, 1);
      await this.storage.events.create(conn.id, "connection.created");
      return conn;
    });

    await this.storage.oauthState.delete(state);
    return connection;
  }

  async reconnect(connectionId: string, redirectUri?: string): Promise<ConnectResult> {
    const conn = await this.storage.connections.get(connectionId);
    if (!conn) throw new Error(`Connection ${connectionId} not found`);

    const adapter = this.providers.get(conn.provider);
    if (!adapter) throw new Error(`Unknown provider: ${conn.provider}`);

    const sessionId = `session_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const state = randomBytes(32).toString("hex");
    const redir = redirectUri ?? this.defaultRedirectUri;
    const codeVerifier = adapter.definition.authorization.usePKCE
      ? randomBytes(32).toString("base64url")
      : null;

    await this.storage.oauthState.save({
      sessionId: state,
      provider: conn.provider,
      userId: conn.userId,
      tenantId: conn.tenantId,
      scopes: conn.grantedScopes,
      codeVerifier,
      redirectUri: redir,
      existingConnectionId: connectionId,
      createdAt: new Date(),
    });

    const authorizationUrl = adapter.authorize(conn.grantedScopes, state, codeVerifier, redir);
    return { authorizationUrl, sessionId };
  }

  private async persistCredentials(connectionId: string, tokens: TokenSet, version: number) {
    await this.storage.credentials.save({
      connectionId,
      encryptedAccessToken: this.vault.encrypt(tokens.accessToken),
      encryptedRefreshToken: tokens.refreshToken ? this.vault.encrypt(tokens.refreshToken) : null,
      expiresAt: tokens.expiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      tokenType: tokens.tokenType,
      metadata: {},
      version,
    });
  }

  private mergeScopes(existing: string[], requested: string[]): string[] {
    return [...new Set([...existing, ...requested])];
  }
}
