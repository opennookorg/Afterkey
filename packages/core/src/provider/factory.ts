import { createHash } from "crypto";
import type { TokenSet, AccountInfo, NormalizedError } from "../types.js";

export interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  redirectUri?: string;
}

export interface ProviderDefinition {
  id: string;
  name: string;

  authorization: {
    endpoint: string;
    params?: Record<string, string>;
    usePKCE?: boolean;
  };

  token: {
    endpoint: string;
    authMethod?: "body" | "header";
  };

  refresh: {
    endpoint?: string;
    rotatesToken?: boolean;
  };

  scopes: {
    separator?: string;
    default: string[];
  };

  identifyAccount: (accessToken: string) => Promise<AccountInfo>;

  normalizeError: (
    status: number,
    body: unknown
  ) => NormalizedError;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly config: ProviderConfig;
  readonly definition: ProviderDefinition;

  authorize(scopes: string[], state: string, codeVerifier: string | null, redirectUri: string): string;
  exchangeCode(code: string, codeVerifier: string | null, redirectUri: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  identifyAccount(accessToken: string): Promise<AccountInfo>;
  normalizeError(status: number, body: unknown): NormalizedError;
}

export function defineProvider(
  definition: ProviderDefinition
): (config: ProviderConfig) => ProviderAdapter {
  return (config: ProviderConfig): ProviderAdapter => {
    return createAdapter(definition, config);
  };
}

function createAdapter(
  def: ProviderDefinition,
  config: ProviderConfig
): ProviderAdapter {
  const tokenAuthHeader =
    def.token.authMethod === "header"
      ? `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`
      : undefined;

  return {
    id: def.id,
    name: def.name,
    config,
    definition: def,

    authorize(scopes, state, codeVerifier, redirectUri) {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: redirectUri,
        state,
        scope: scopes.join(def.scopes.separator ?? " "),
        ...def.authorization.params,
      });

      if (def.authorization.usePKCE && codeVerifier) {
        params.set("code_challenge", generateCodeChallenge(codeVerifier));
        params.set("code_challenge_method", "S256");
      }

      return `${def.authorization.endpoint}?${params.toString()}`;
    },

    async exchangeCode(code, codeVerifier, redirectUri) {
      const body: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      };

      if (def.token.authMethod !== "header") {
        body.client_id = config.clientId;
        body.client_secret = config.clientSecret;
      }

      if (def.authorization.usePKCE && codeVerifier) {
        body.code_verifier = codeVerifier;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      };
      if (tokenAuthHeader) headers["Authorization"] = tokenAuthHeader;

      const res = await fetch(def.token.endpoint, {
        method: "POST",
        headers,
        body: new URLSearchParams(body),
      });

      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new ProviderError(def.id, "token_exchange_failed", json);

      return parseTokenResponse(json);
    },

    async refresh(refreshToken) {
      const endpoint = def.refresh.endpoint ?? def.token.endpoint;

      const body: Record<string, string> = {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      };

      if (def.token.authMethod !== "header") {
        body.client_id = config.clientId;
        body.client_secret = config.clientSecret;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      };
      if (tokenAuthHeader) headers["Authorization"] = tokenAuthHeader;

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: new URLSearchParams(body),
      });

      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new ProviderError(def.id, "refresh_failed", json);

      const tokens = parseTokenResponse(json);
      if (!tokens.refreshToken && def.refresh.rotatesToken) {
        tokens.refreshToken = refreshToken;
      }
      return tokens;
    },

    identifyAccount: def.identifyAccount,
    normalizeError: def.normalizeError,
  };
}

function parseTokenResponse(json: Record<string, unknown>): TokenSet {
  const expiresIn = json.expires_in as number | undefined;
  return {
    accessToken: json.access_token as string,
    refreshToken: (json.refresh_token as string) ?? null,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    refreshTokenExpiresAt: null,
    tokenType: (json.token_type as string) ?? "Bearer",
    scope: (json.scope as string) ?? null,
    rawResponse: json,
  };
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly code: string,
    public readonly details: unknown
  ) {
    super(`[${provider}] ${code}`);
    this.name = "ProviderError";
  }
}
