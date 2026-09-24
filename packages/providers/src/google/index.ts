import { defineProvider } from "@afterkey/core";
import type { ProviderConfig } from "@afterkey/core";

export const google = defineProvider({
  id: "google",
  name: "Google",

  authorization: {
    endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    params: {
      access_type: "offline",
      prompt: "consent",
    },
    usePKCE: true,
  },

  token: {
    endpoint: "https://oauth2.googleapis.com/token",
    authMethod: "body",
  },

  refresh: {
    rotatesToken: false,
  },

  scopes: {
    separator: " ",
    default: ["openid", "email", "profile"],
  },

  async identifyAccount(accessToken) {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await res.json()) as { id: string; email: string; name: string };
    return {
      id: data.id,
      email: data.email,
      displayName: data.name,
      workspaceId: null,
      workspaceName: null,
    };
  },

  normalizeError(status, body) {
    const err = body as { error?: string; error_description?: string } | null;
    const code = err?.error ?? "unknown";

    if (code === "invalid_grant") {
      return { permanent: true, reason: "refresh_token_revoked", providerCode: code, retryable: false };
    }
    if (status === 401 || status === 403) {
      return { permanent: true, reason: "unauthorized", providerCode: code, retryable: false };
    }
    return { permanent: false, reason: code, providerCode: code, retryable: status >= 500 };
  },
});

export type { ProviderConfig };
